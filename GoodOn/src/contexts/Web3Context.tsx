import React, { createContext, useContext, useState, useEffect } from 'react';
import Web3 from 'web3';
import { fallbackChainConfig, fetchChainConfig, type PublicChainConfig } from '../config/chainConfig';

// Extends the window object to recognize Ethereum injected providers like MetaMask
declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Web3ContextType {
  web3: Web3 | null;
  account: string | null;
  chainId: number | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnecting: boolean;
  error: string | null;
}

const Web3Context = createContext<Web3ContextType>({
  web3: null,
  account: null,
  chainId: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  isConnecting: false,
  error: null,
});

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainConfig, setChainConfig] = useState<PublicChainConfig>(fallbackChainConfig);

  useEffect(() => {
    let isMounted = true;
    fetchChainConfig()
      .then((config) => {
        if (isMounted) setChainConfig(config);
      })
      .catch((err) => {
        console.warn('Failed to load wallet chain config; using local fallback.', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // Basic init if injected provider exists
    if (window.ethereum) {
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);
      
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || null);
      });

      window.ethereum.on('chainChanged', (cId: string) => {
        setChainId(parseInt(cId, 16));
        window.location.reload(); // Best practice per MetaMask docs
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Please install a Web3 wallet like MetaMask.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const currentChainIdStr = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdStr, 16);
      const targetChainId = chainConfig.chainId;
      const targetExplorer = chainConfig.explorerBaseUrl.endsWith('/')
        ? chainConfig.explorerBaseUrl
        : `${chainConfig.explorerBaseUrl}/`;

      if (currentChainId !== targetChainId) {
        // Prompt to switch or add the selected World Chain network.
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${targetChainId.toString(16)}` }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask.
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${targetChainId.toString(16)}`,
                  chainName: chainConfig.label,
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: [chainConfig.rpcUrl],
                  blockExplorerUrls: [targetExplorer],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      setAccount(accounts[0]);
      setChainId(targetChainId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setChainId(null);
  };

  return (
    <Web3Context.Provider value={{ web3, account, chainId, connectWallet, disconnectWallet, isConnecting, error }}>
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
