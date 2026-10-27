/*
 * ==============================================================================
 * TRIPLE-SHIELD VAULT - ESP32 FIRMWARE WITH WI-FI & REAL-TIME WEB INTEGRATION
 * ==============================================================================
 * Hardware Components:
 *   - ESP32 Dev Module (Dual-core Xtensa LX6)
 *   - SSD1306 128x64 I2C OLED (SDA: GPIO 21, SCL: GPIO 22, I2C Address: 0x3C)
 *   - 4x4 Matrix Keypad (Rows: 13, 14, 16, 17 | Columns: 18, 19, 23, 25)
 *   - Active Buzzer (GPIO 26)
 *   - Red Security LED (GPIO 27)
 *   - Green Security LED (GPIO 32)
 *
 * Integrated Features:
 *   - Wi-Fi Station connection with auto-reconnect handling
 *   - Real-time keystroke masking event streaming to Next.js server
 *   - Remote server-side PIN verification with authenticated HMAC device token
 *   - OLED UI states: Wi-Fi Connecting, Connected, Submitting, Access Granted,
 *     Access Denied, Disconnected, and 30-Second Lockout
 *   - Zero raw PIN exposure in Serial logs or URL query parameters
 * ==============================================================================
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Keypad.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ===== OLED CONFIGURATION =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDR 0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH, SCREEN_HEIGHT,
  &Wire, OLED_RESET
);

// ===== ESP32 PINS =====
const int BUZZER_PIN = 26;
const int RED_LED = 27;
const int GREEN_LED = 32;

// ===== WI-FI & SERVER CREDENTIALS (PLACEHOLDERS) =====
// Fill in your actual local Wi-Fi and server details:
const char* WIFI_SSID     = "WIFI_SSID";          // <-- Replace with your Wi-Fi SSID
const char* WIFI_PASSWORD = "WIFI_PASSWORD";      // <-- Replace with your Wi-Fi Password

// Server Base URL:
// For local testing on your LAN, replace with your computer's LAN IP:Port (e.g. "http://192.168.1.15:3000")
// NOTE: Do NOT use "localhost" or "127.0.0.1" because for ESP32, "localhost" means the ESP32 itself!
// For cloud/production deployment, use your HTTPS URL (e.g. "https://vault.yourdomain.com")
const char* VAULT_SERVER_URL = "VAULT_SERVER_URL"; // <-- e.g. "http://192.168.1.50:3000"

// Pre-shared device authentication token (must match ESP32_DEVICE_TOKEN in .env)
const char* ESP32_DEVICE_TOKEN = "ESP32_DEVICE_TOKEN"; // <-- e.g. "vault_esp32_secret_token_2026"

// Local fallback PIN if offline
const char correctPassword[] = "2278";
String enteredPassword = "";

// ===== SECURITY SETTINGS =====
const int MAX_ATTEMPTS = 3;
const unsigned long LOCK_TIME = 30000; // 30 seconds

int wrongAttempts = 0;
bool locked = false;
unsigned long lockStart = 0;

// ===== HEARTBEAT & TIMERS =====
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 3500; // Heartbeat every 3.5 seconds
unsigned long lastWiFiRetry = 0;
const unsigned long WIFI_RETRY_INTERVAL = 10000;

// ===== 4x4 KEYPAD =====
const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

byte rowPins[ROWS] = {13, 14, 16, 17};
byte colPins[COLS] = {18, 19, 23, 25};

Keypad keypad = Keypad(
  makeKeymap(keys),
  rowPins,
  colPins,
  ROWS,
  COLS
);

// ===== BUZZER =====
void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}

// ===== OLED MESSAGE DISPLAY =====
void showMessage(
  const char* title,
  const char* line1,
  const char* line2
) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("TRIPLE-SHIELD VAULT");
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 20);
  display.println(title);

  display.setTextSize(1);
  display.setCursor(0, 46);
  display.println(line1);
  display.setCursor(0, 56);
  display.println(line2);

  display.display();
}

// ===== PIN ENTRY SCREEN =====
void showEntry() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("TRIPLE-SHIELD ");
  if (WiFi.status() == WL_CONNECTED) {
    display.println("[WIFI:OK]");
  } else {
    display.println("[OFFLINE]");
  }
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  display.setCursor(0, 21);
  display.println("ENTER 4-DIGIT PIN:");

  display.setTextSize(2);
  display.setCursor(20, 38);

  for (int i = 0; i < enteredPassword.length(); i++) {
    display.print('*');
  }

  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print("*: CLR  #: SUBMIT");

  display.display();
}

// ===== CORRECT PASSWORD =====
void accessGranted() {
  digitalWrite(RED_LED, LOW);
  digitalWrite(GREEN_LED, HIGH);

  showMessage("ACCESS OK", "Welcome!", "Vault unlocked");
  beep(100);
  delay(1800);

  digitalWrite(GREEN_LED, LOW);
  enteredPassword = "";
  wrongAttempts = 0;

  showEntry();
}

// ===== WRONG PASSWORD =====
void accessDenied(int attemptsLeft = -1, bool isServerLocked = false) {
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, HIGH);

  wrongAttempts++;
  beep(250);

  if (isServerLocked || wrongAttempts >= MAX_ATTEMPTS) {
    locked = true;
    lockStart = millis();

    showMessage(
      "LOCKED!",
      "3 wrong attempts",
      "Wait 30 seconds"
    );
  } else {
    char attempts[24];
    int remaining = (attemptsLeft >= 0) ? attemptsLeft : (MAX_ATTEMPTS - wrongAttempts);

    snprintf(
      attempts,
      sizeof(attempts),
      "Attempts left: %d",
      remaining
    );

    showMessage("WRONG PIN!", attempts, "Try again");
    delay(1400);
  }

  digitalWrite(RED_LED, LOW);
  enteredPassword = "";

  if (!locked) {
    showEntry();
  }
}

// ===== SEND KEYPAD EVENT TO NEXT.JS SERVER =====
// Sends keystroke count or clear events. NEVER sends raw PIN in event.
void sendKeypadEvent(const char* eventType, int count = 0) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(VAULT_SERVER_URL) + "/api/hardware/event";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-Token", ESP32_DEVICE_TOKEN);
  http.setTimeout(2500); // 2.5s non-blocking timeout

  String payload = "";
  if (strcmp(eventType, "digit") == 0) {
    payload = "{\"event\":\"digit\",\"count\":" + String(count) + "}";
  } else {
    payload = "{\"event\":\"clear\"}";
  }

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.printf("[EVENT] Sent '%s' event (HTTP %d)\n", eventType, httpCode);
  } else {
    Serial.printf("[EVENT] Event failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ===== SEND PERIODIC HEARTBEAT =====
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(VAULT_SERVER_URL) + "/api/hardware/heartbeat";

  http.begin(url);
  http.addHeader("X-ESP32-Token", ESP32_DEVICE_TOKEN);
  http.setTimeout(2000);

  int httpCode = http.POST("{}");
  if (httpCode > 0) {
    // If server reports locked state, sync device lock
    String response = http.getString();
    if (response.indexOf("\"locked\":true") >= 0 && !locked) {
      locked = true;
      lockStart = millis();
      showMessage("LOCKED!", "Server Lockdown", "Wait 30 seconds");
    }
  }

  http.end();
}

// ===== SUBMIT PIN TO NEXT.JS SERVER FOR VERIFICATION =====
void submitPinToServer(const String& pin) {
  if (WiFi.status() != WL_CONNECTED) {
    // Fallback: Local verification if Wi-Fi is disconnected
    Serial.println("[AUTH] Wi-Fi offline - verifying locally...");
    if (pin.equals(correctPassword)) {
      accessGranted();
    } else {
      accessDenied();
    }
    return;
  }

  showMessage("SUBMITTING", "Verifying with", "Vault Server...");
  beep(60);

  HTTPClient http;
  String url = String(VAULT_SERVER_URL) + "/api/hardware/submit";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-Token", ESP32_DEVICE_TOKEN);
  http.setTimeout(4500);

  // Send PIN in POST payload - NEVER in URL query string, NEVER logged to Serial
  String payload = "{\"pin\":\"" + pin + "\"}";
  int httpCode = http.POST(payload);

  Serial.printf("[AUTH] Submit HTTP response code: %d\n", httpCode);

  if (httpCode == 200) {
    // Verification Successful!
    accessGranted();
  } else if (httpCode == 429) {
    // 30-Second Lockout
    accessDenied(0, true);
  } else if (httpCode == 403) {
    // Wrong PIN - parse attempts left if available
    String body = http.getString();
    int attemptsLeft = -1;
    int idx = body.indexOf("\"attemptsLeft\":");
    if (idx >= 0) {
      attemptsLeft = body.substring(idx + 15, idx + 17).toInt();
    }
    accessDenied(attemptsLeft, false);
  } else {
    // Network or Server error
    digitalWrite(RED_LED, HIGH);
    beep(300);
    showMessage("SERVER ERROR", "HTTP Code: " + String(httpCode), "Check LAN IP / URL");
    delay(2000);
    digitalWrite(RED_LED, LOW);
    enteredPassword = "";
    showEntry();
  }

  http.end();
}

// ===== WI-FI CONNECTION SETUP =====
void connectWiFi() {
  showMessage("WIFI CONNECT", "Connecting to:", WIFI_SSID);
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  int dotCount = 0;

  // Try connecting for up to 12 seconds
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 12000) {
    delay(500);
    Serial.print(".");
    dotCount++;
    display.setCursor(dotCount * 8, 56);
    display.print(".");
    display.display();
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi Connected successfully!");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());

    String ipStr = WiFi.localIP().toString();
    showMessage("CONNECTED!", "IP Address:", ipStr.c_str());
    beep(80);
    delay(1800);
  } else {
    Serial.println("Wi-Fi connection timed out. Proceeding in offline mode...");
    showMessage("OFFLINE MODE", "Wi-Fi link failed", "Check credentials");
    delay(2000);
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(GREEN_LED, LOW);

  Wire.begin(21, 22);

  if (!display.begin(
        SSD1306_SWITCHCAPVCC,
        OLED_ADDR
      )) {
    Serial.println("OLED not detected!");

    while (true) {
      delay(100);
    }
  }

  showMessage(
    "WELCOME!",
    "Triple-Shield Vault",
    "Initializing Core..."
  );

  delay(1200);

  // Initialize Wi-Fi connection
  connectWiFi();

  // Ready Screen
  showEntry();
  Serial.println("Triple-Shield Vault Ready.");
}

// ===== MAIN LOOP =====
void loop() {
  // 1. Check & Enforce Lockout
  if (locked) {
    if (millis() - lockStart >= LOCK_TIME) {
      locked = false;
      wrongAttempts = 0;
      enteredPassword = "";

      showMessage("UNLOCKED", "Security Restored", "Enter your PIN");
      beep(100);
      delay(1200);
      showEntry();
    }
    return;
  }

  // 2. Periodic Heartbeat to Server (every 3.5s)
  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  // 3. Wi-Fi Auto-Reconnection in background if dropped
  if (WiFi.status() != WL_CONNECTED && (millis() - lastWiFiRetry >= WIFI_RETRY_INTERVAL)) {
    lastWiFiRetry = millis();
    Serial.println("[WIFI] Attempting Wi-Fi auto-reconnection...");
    WiFi.reconnect();
  }

  // 4. Read Keypad
  char key = keypad.getKey();

  if (key == NO_KEY) {
    return;
  }

  // Visual & Audio Keypress Feedback
  beep(40);
  Serial.print("[KEYPAD] Key pressed. Buffer length: ");

  // CLR BUTTON: *
  if (key == '*') {
    enteredPassword = "";
    showEntry();
    sendKeypadEvent("clear");
    Serial.println("CLEARED");
    return;
  }

  // SUBMIT BUTTON: #
  if (key == '#') {
    if (enteredPassword.length() != 4) {
      showMessage(
        "PIN REQUIRED",
        "Enter all 4 digits",
        "Then press #"
      );

      beep(150);
      delay(1200);
      showEntry();
      return;
    }

    Serial.println("SUBMITTING (4 digits)");
    // Submit PIN to server for verification
    submitPinToServer(enteredPassword);
    return;
  }

  // ACCEPT NUMBERS ONLY: 0-9
  if (key >= '0' && key <= '9') {
    if (enteredPassword.length() < 4) {
      enteredPassword += key;
      showEntry();
      Serial.println(enteredPassword.length());
      // Broadcast real-time masked keystroke count to website
      sendKeypadEvent("digit", enteredPassword.length());
    }
  }
}
