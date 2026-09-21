// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PasswordLedger {
    struct StegoRecord {
        string imageHash;
        uint256 timestamp;
        address owner;
    }

    // Mapping from Image Hash -> StegoRecord
    mapping(string => StegoRecord) private records;

    event RecordAdded(string indexed imageHash, address indexed owner, uint256 timestamp);

    // Store hash on blockchain
    function registerHash(string memory _imageHash) public {
        require(records[_imageHash].timestamp == 0, "Hash already registered!");
        
        records[_imageHash] = StegoRecord({
            imageHash: _imageHash,
            timestamp: block.timestamp,
            owner: msg.sender
        });

        emit RecordAdded(_imageHash, msg.sender, block.timestamp);
    }

    // Verify if stego-image hash exists and is authentic
    function verifyHash(string memory _imageHash) public view returns (bool exists, uint256 timestamp, address owner) {
        StegoRecord memory record = records[_imageHash];
        if (record.timestamp > 0) {
            return (true, record.timestamp, record.owner);
        }
        return (false, 0, address(0));
    }
}