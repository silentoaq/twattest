// src/web/src/pages/VerifyPage.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiService } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Loader2, Shield, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';

interface PhantomWindow extends Window {
  phantom?: {
    solana?: {
      isPhantom: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
    };
  };
}

interface WalletState {
  connected: boolean;
  publicKey: string | null;
  did: string | null;
  connecting: boolean;
}

export const VerifyPage: React.FC = () => {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    publicKey: null,
    did: null,
    connecting: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const getPhantomProvider = () => {
    const win = window as unknown as PhantomWindow;
    if ('phantom' in win) {
      const provider = win.phantom?.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    return null;
  };

  const connectWallet = async () => {
    try {
      setWallet(prev => ({ ...prev, connecting: true }));
      setError('');

      const provider = getPhantomProvider();
      if (!provider) {
        window.open('https://phantom.app/', '_blank');
        throw new Error('請先安裝 Phantom 錢包');
      }

      const { publicKey } = await provider.connect();
      const key = publicKey.toString();
      const did = `did:pkh:sol:${key}`;

      // 驗證擁有權
      const message = new TextEncoder().encode(
        `驗證 Twattest 身份 - ${new Date().toISOString()}`
      );
      await provider.signMessage(message);

      setWallet({
        connected: true,
        publicKey: key,
        did,
        connecting: false
      });

    } catch (error) {
      console.error('錢包連接失敗:', error);
      setError(error instanceof Error ? error.message : '錢包連接失敗');
      setWallet(prev => ({
        ...prev,
        connected: false,
        publicKey: null,
        did: null,
        connecting: false
      }));
    }
  };

  const disconnectWallet = async () => {
    try {
      const provider = getPhantomProvider();
      if (provider) {
        await provider.disconnect();
      }
    } catch (error) {
      console.error('斷開連接失敗:', error);
    }

    setWallet({
      connected: false,
      publicKey: null,
      did: null,
      connecting: false
    });
  };

  const handleStartVerification = async () => {
    if (!wallet.connected || !wallet.did) {
      setError('請先連接錢包');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await apiService.startVerification(wallet.did);
      
      if (result.success && result.vpRequestUri) {
        navigate('/result', { 
          state: { 
            vpRequestUri: result.vpRequestUri,
            holderDid: wallet.did,
            requestId: result.requestId 
          } 
        });
      } else {
        setError(result.error || '啟動驗證失敗');
      }
    } catch (err) {
      setError('網路錯誤，請稍後再試');
      console.error('Verification start failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Twattest</CardTitle>
          <CardDescription className="text-base">
            去中心化身份驗證服務
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* 錢包連接區域 */}
          {!wallet.connected ? (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  請連接您的 Phantom 錢包以開始驗證
                </p>
              </div>
              
              <Button 
                onClick={connectWallet}
                disabled={wallet.connecting}
                className="w-full h-12 text-base font-medium"
              >
                {wallet.connecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    連接中...
                  </>
                ) : (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    連接 Phantom 錢包
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* 已連接錢包的驗證區域 */
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    錢包已連接
                  </span>
                </div>
                <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                  <div>公鑰: {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-8)}</div>
                  <div className="font-mono">DID: {wallet.did}</div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={disconnectWallet}
                  className="mt-2 text-xs"
                >
                  重新連接
                </Button>
              </div>

              <Button 
                onClick={handleStartVerification}
                disabled={loading}
                className="w-full h-12 text-base font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    啟動中...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    開始身份驗證
                  </>
                )}
              </Button>
            </div>
          )}
          
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="text-xs text-muted-foreground text-center">
              支援的憑證類型：自然人憑證、房產憑證
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};