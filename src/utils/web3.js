import { ethers } from "ethers";

const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
const CONTRACT_ABI = [
  "function registerHash(string memory _imageHash) public",
  "function verifyHash(string memory _imageHash) public view returns (bool, uint256, address)"
];

export async function connectWallet() {
  if (typeof window.ethereum !== "undefined") {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return { provider, signer };
  } else {
    throw new Error("MetaMask is not installed");
  }
}

export async function storeHashOnBlockchain(imageHash) {
  const { signer } = await connectWallet();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract.registerHash(imageHash);
  await tx.wait(); // Wait for transaction confirmation
  return tx.hash;
}