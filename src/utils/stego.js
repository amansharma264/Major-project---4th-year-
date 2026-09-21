// Convert text string to binary string
function textToBin(text) {
  return text
    .split('')
    .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('');
}

// Convert binary string back to text string
function binToText(bin) {
  let bytes = bin.match(/.{1,8}/g) || [];
  return bytes.map(byte => String.fromCharCode(parseInt(byte, 2))).join('');
}

// LSB Embed: Hides ciphertext into carrier image
export function hideDataInCanvas(canvas, secretText) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Add delimiter '||END||' to know where secret stops
  const fullPayload = secretText + '||END||';
  const binaryPayload = textToBin(fullPayload);

  if (binaryPayload.length > data.length / 4) {
    throw new Error('Image too small to store this secret payload.');
  }

  for (let i = 0; i < binaryPayload.length; i++) {
    // Modify LSB of Red channel (data[i * 4])
    data[i * 4] = (data[i * 4] & 0xfe) | parseInt(binaryPayload[i], 10);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

// LSB Extract: Extracts ciphertext from carrier stego-image
export function extractDataFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  let binaryPayload = '';
  for (let i = 0; i < data.length; i += 4) {
    binaryPayload += (data[i] & 1).toString();
  }

  // Convert binary to text in chunks
  let extractedText = '';
  for (let i = 0; i < binaryPayload.length; i += 8) {
    const byte = binaryPayload.substring(i, i + 8);
    const char = String.fromCharCode(parseInt(byte, 2));
    extractedText += char;
    if (extractedText.endsWith('||END||')) {
      return extractedText.replace('||END||', '');
    }
  }
  return '';
}