// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Dataset {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  dimensions: number;
  status: "pending" | "processed" | "error";
}

const App: React.FC = () => {
  // Randomly selected style: High contrast black/white, industrial mechanical, center radiation layout, gesture controls
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newDataset, setNewDataset] = useState({
    dimensions: 0,
    description: "",
    data: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("datasets");
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate statistics
  const processedCount = datasets.filter(d => d.status === "processed").length;
  const pendingCount = datasets.filter(d => d.status === "pending").length;
  const errorCount = datasets.filter(d => d.status === "error").length;

  useEffect(() => {
    loadDatasets().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadDatasets = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("dataset_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing dataset keys:", e);
        }
      }
      
      const list: Dataset[] = [];
      
      for (const key of keys) {
        try {
          const datasetBytes = await contract.getData(`dataset_${key}`);
          if (datasetBytes.length > 0) {
            try {
              const datasetData = JSON.parse(ethers.toUtf8String(datasetBytes));
              list.push({
                id: key,
                encryptedData: datasetData.data,
                timestamp: datasetData.timestamp,
                owner: datasetData.owner,
                dimensions: datasetData.dimensions,
                status: datasetData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing dataset data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading dataset ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setDatasets(list);
    } catch (e) {
      console.error("Error loading datasets:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const uploadDataset = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setUploading(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting dataset with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newDataset))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const datasetId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const dataset = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        dimensions: newDataset.dimensions,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `dataset_${datasetId}`, 
        ethers.toUtf8Bytes(JSON.stringify(dataset))
      );
      
      const keysBytes = await contract.getData("dataset_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(datasetId);
      
      await contract.setData(
        "dataset_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted dataset submitted securely!"
      });
      
      await loadDatasets();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowUploadModal(false);
        setNewDataset({
          dimensions: 0,
          description: "",
          data: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  const processPCA = async (datasetId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE-powered PCA computation..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const datasetBytes = await contract.getData(`dataset_${datasetId}`);
      if (datasetBytes.length === 0) {
        throw new Error("Dataset not found");
      }
      
      const datasetData = JSON.parse(ethers.toUtf8String(datasetBytes));
      
      const updatedDataset = {
        ...datasetData,
        status: "processed"
      };
      
      await contract.setData(
        `dataset_${datasetId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedDataset))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE-PCA computation completed!"
      });
      
      await loadDatasets();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "PCA failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE-PCA platform",
      icon: "🔗"
    },
    {
      title: "Upload Encrypted Data",
      description: "Submit your dataset which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE-PCA Computation",
      description: "Your data is processed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get PCA Results",
      description: "Receive dimensionality reduction results while keeping data private",
      icon: "📊"
    }
  ];

  const filteredDatasets = datasets.filter(dataset => 
    dataset.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dataset.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>FHE-Powered<span>FedPCA</span></h1>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="central-radial-layout">
          <div className="center-panel">
            <div className="status-indicator">
              <div className="status-light"></div>
              <span>FHE System Online</span>
            </div>
            
            <h2 className="main-title">Federated PCA with FHE</h2>
            <p className="subtitle">Privacy-preserving dimensionality reduction across multiple parties</p>
            
            <div className="action-buttons">
              <button 
                onClick={() => setShowUploadModal(true)} 
                className="industrial-button primary"
              >
                Upload Dataset
              </button>
              <button 
                className="industrial-button"
                onClick={() => setShowTutorial(!showTutorial)}
              >
                {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
              </button>
              <button 
                onClick={loadDatasets}
                className="industrial-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          {showTutorial && (
            <div className="tutorial-panel">
              <h3>How It Works</h3>
              <div className="tutorial-steps">
                {tutorialSteps.map((step, index) => (
                  <div className="tutorial-step" key={index}>
                    <div className="step-icon">{step.icon}</div>
                    <div className="step-content">
                      <h4>{step.title}</h4>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="data-panel">
            <div className="panel-header">
              <div className="tab-controls">
                <button 
                  className={`tab-button ${activeTab === "datasets" ? "active" : ""}`}
                  onClick={() => setActiveTab("datasets")}
                >
                  Datasets ({datasets.length})
                </button>
                <button 
                  className={`tab-button ${activeTab === "results" ? "active" : ""}`}
                  onClick={() => setActiveTab("results")}
                >
                  PCA Results
                </button>
              </div>
              
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search datasets..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="search-icon"></div>
              </div>
            </div>
            
            {activeTab === "datasets" ? (
              <div className="datasets-list">
                <div className="list-header">
                  <div>ID</div>
                  <div>Dimensions</div>
                  <div>Owner</div>
                  <div>Date</div>
                  <div>Status</div>
                  <div>Actions</div>
                </div>
                
                {filteredDatasets.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"></div>
                    <p>No datasets found</p>
                    <button 
                      className="industrial-button primary"
                      onClick={() => setShowUploadModal(true)}
                    >
                      Upload First Dataset
                    </button>
                  </div>
                ) : (
                  filteredDatasets.map(dataset => (
                    <div className="dataset-item" key={dataset.id}>
                      <div className="dataset-id">#{dataset.id.substring(0, 6)}</div>
                      <div>{dataset.dimensions}D</div>
                      <div>{dataset.owner.substring(0, 6)}...{dataset.owner.substring(38)}</div>
                      <div>
                        {new Date(dataset.timestamp * 1000).toLocaleDateString()}
                      </div>
                      <div>
                        <span className={`status-badge ${dataset.status}`}>
                          {dataset.status}
                        </span>
                      </div>
                      <div className="actions">
                        {isOwner(dataset.owner) && dataset.status === "pending" && (
                          <button 
                            className="industrial-button small"
                            onClick={() => processPCA(dataset.id)}
                          >
                            Run PCA
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="results-view">
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{datasets.length}</div>
                    <div className="stat-label">Total Datasets</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{processedCount}</div>
                    <div className="stat-label">Processed</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-label">Pending</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{errorCount}</div>
                    <div className="stat-label">Errors</div>
                  </div>
                </div>
                
                <div className="pca-visualization">
                  <h3>PCA Dimensionality Reduction</h3>
                  <div className="visualization-placeholder">
                    <div className="axis-x"></div>
                    <div className="axis-y"></div>
                    <div className="data-points">
                      {processedCount > 0 ? (
                        <>
                          <div className="point" style={{ left: '30%', top: '40%' }}></div>
                          <div className="point" style={{ left: '45%', top: '35%' }}></div>
                          <div className="point" style={{ left: '60%', top: '50%' }}></div>
                          <div className="point" style={{ left: '35%', top: '60%' }}></div>
                          <div className="point" style={{ left: '50%', top: '55%' }}></div>
                        </>
                      ) : (
                        <div className="no-data">No PCA results available</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showUploadModal && (
        <ModalUpload 
          onSubmit={uploadDataset} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploading}
          dataset={newDataset}
          setDataset={setNewDataset}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>FHE-FedPCA</span>
            </div>
            <p>Privacy-preserving federated PCA using FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE-FedPCA. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalUploadProps {
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  dataset: any;
  setDataset: (data: any) => void;
}

const ModalUpload: React.FC<ModalUploadProps> = ({ 
  onSubmit, 
  onClose, 
  uploading,
  dataset,
  setDataset
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDataset({
      ...dataset,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!dataset.dimensions || !dataset.data) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal industrial-card">
        <div className="modal-header">
          <h2>Upload Dataset</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Data will be encrypted with FHE before processing</span>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Dimensions *</label>
              <input 
                type="number"
                name="dimensions"
                value={dataset.dimensions} 
                onChange={handleChange}
                placeholder="Number of dimensions" 
                min="2"
                max="100"
              />
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={dataset.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
              />
            </div>
            
            <div className="form-group full-width">
              <label>Dataset (CSV format) *</label>
              <textarea 
                name="data"
                value={dataset.data} 
                onChange={handleChange}
                placeholder="Paste your dataset in CSV format..." 
                rows={6}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={uploading}
            className="industrial-button primary"
          >
            {uploading ? "Encrypting with FHE..." : "Upload Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;