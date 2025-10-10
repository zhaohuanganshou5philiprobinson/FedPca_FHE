// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FederatedPCA is SepoliaConfig {
    // Structure for encrypted data contributions
    struct EncryptedData {
        euint32[] encryptedFeatures; // Encrypted feature vector
        uint256 timestamp;
        address contributor;
    }
    
    // Structure for encrypted PCA results
    struct EncryptedPCA {
        euint32[] principalComponents; // Encrypted principal components
        euint32[] explainedVariance; // Encrypted explained variance
        bool isComputed;
    }
    
    // Contract state
    uint256 public dataCount;
    uint256 public featureCount;
    bool public computationTriggered;
    EncryptedPCA public pcaResult;
    
    // Mapping for encrypted data contributions
    mapping(uint256 => EncryptedData) public encryptedDataSets;
    
    // Access control for contributors
    mapping(address => bool) public registeredContributors;
    address public owner;
    
    // Events
    event DataSubmitted(uint256 indexed id, address indexed contributor);
    event ComputationStarted();
    event PCAComputed();
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }
    
    modifier onlyContributor() {
        require(registeredContributors[msg.sender], "Not registered contributor");
        _;
    }
    
    modifier computationNotStarted() {
        require(!computationTriggered, "Computation already started");
        _;
    }
    
    /// @notice Contract constructor
    /// @param _featureCount Number of features in each data vector
    constructor(uint256 _featureCount) {
        owner = msg.sender;
        featureCount = _featureCount;
        dataCount = 0;
        computationTriggered = false;
    }
    
    /// @notice Register a new data contributor
    function registerContributor(address contributor) public onlyOwner {
        registeredContributors[contributor] = true;
    }
    
    /// @notice Submit encrypted data contribution
    function submitEncryptedData(euint32[] memory encryptedFeatures) 
        public onlyContributor computationNotStarted 
    {
        require(encryptedFeatures.length == featureCount, "Invalid feature count");
        
        dataCount++;
        encryptedDataSets[dataCount] = EncryptedData({
            encryptedFeatures: encryptedFeatures,
            timestamp: block.timestamp,
            contributor: msg.sender
        });
        
        emit DataSubmitted(dataCount, msg.sender);
    }
    
    /// @notice Start federated PCA computation
    function startPCAComputation() public onlyOwner computationNotStarted {
        require(dataCount >= 2, "Insufficient data contributions");
        computationTriggered = true;
        emit ComputationStarted();
    }
    
    /// @notice Store encrypted PCA results
    function storePCAResults(
        euint32[] memory principalComponents,
        euint32[] memory explainedVariance
    ) public onlyOwner {
        require(computationTriggered, "Computation not started");
        require(principalComponents.length == featureCount * featureCount, "Invalid component size");
        require(explainedVariance.length == featureCount, "Invalid variance size");
        
        pcaResult = EncryptedPCA({
            principalComponents: principalComponents,
            explainedVariance: explainedVariance,
            isComputed: true
        });
        
        emit PCAComputed();
    }
    
    /// @notice Get encrypted principal components
    function getPrincipalComponents() public view returns (euint32[] memory) {
        require(pcaResult.isComputed, "PCA not computed");
        return pcaResult.principalComponents;
    }
    
    /// @notice Get encrypted explained variance
    function getExplainedVariance() public view returns (euint32[] memory) {
        require(pcaResult.isComputed, "PCA not computed");
        return pcaResult.explainedVariance;
    }
    
    /// @notice Request decryption of PCA results
    function requestPCADecryption() public onlyOwner {
        require(pcaResult.isComputed, "PCA not computed");
        
        // Prepare all ciphertexts for decryption
        bytes32[] memory allCiphertexts = new bytes32[](
            pcaResult.principalComponents.length + 
            pcaResult.explainedVariance.length
        );
        
        uint256 counter = 0;
        for (uint i = 0; i < pcaResult.principalComponents.length; i++) {
            allCiphertexts[counter++] = FHE.toBytes32(pcaResult.principalComponents[i]);
        }
        for (uint i = 0; i < pcaResult.explainedVariance.length; i++) {
            allCiphertexts[counter++] = FHE.toBytes32(pcaResult.explainedVariance[i]);
        }
        
        // Request decryption
        FHE.requestDecryption(allCiphertexts, this.handleDecryptedPCA.selector);
    }
    
    /// @notice Handle decrypted PCA results
    function handleDecryptedPCA(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values (could be stored or emitted)
        // Implementation depends on specific use case requirements
    }
}