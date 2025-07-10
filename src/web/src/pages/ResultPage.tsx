import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiService } from '@/lib/api';
import QRCode from 'qrcode';

interface LocationState {
  vpRequestUri: string;
  holderDid: string;
  requestId: string;
}

export const ResultPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [attestationStatus, setAttestationStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state?.vpRequestUri) {
      navigate('/');
      return;
    }

    // 生成 QR 碼
    QRCode.toDataURL(state.vpRequestUri, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }).then(setQrCodeUrl);
  }, [state, navigate]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(state.vpRequestUri);
      // 可以加個 toast 提示
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

  const checkAttestationStatus = async () => {
    if (!state?.holderDid) return;

    setChecking(true);
    setError('');

    try {
      const status = await apiService.getAttestationStatus(state.holderDid);
      setAttestationStatus(status);
    } catch (err) {
      setError('查詢失敗，請稍後再試');
      console.error('Status check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  if (!state) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">身份驗證</h1>
          <Button variant="outline" onClick={() => navigate('/')}>
            重新開始
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>等待用戶驗證</CardTitle>
            <CardDescription>
              請用戶使用支援 OID4VP 的錢包掃描 QR 碼或開啟連結
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center space-y-4">
              {qrCodeUrl && (
                <img 
                  src={qrCodeUrl} 
                  alt="VP Request QR Code" 
                  className="border rounded-lg"
                />
              )}
              
              <div className="w-full space-y-2">
                <label className="text-sm font-medium">VP Request URI:</label>
                <div className="flex space-x-2">
                  <input
                    value={state.vpRequestUri}
                    readOnly
                    className="flex-1 text-xs font-mono bg-muted p-2 rounded border"
                  />
                  <Button size="sm" onClick={copyToClipboard}>
                    複製
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground text-center">
                <p>請求 ID: {state.requestId}</p>
                <p>Holder DID: {state.holderDid}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attestation 狀態</CardTitle>
            <CardDescription>
              查詢此用戶的鏈上認證狀態
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={checkAttestationStatus} disabled={checking}>
              {checking ? '查詢中...' : '檢查狀態'}
            </Button>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            {attestationStatus && (
              <div className="space-y-3">
                <h3 className="font-medium">認證狀態:</h3>
                
                {attestationStatus.twfido && (
                  <div className="border rounded p-3">
                    <h4 className="font-medium text-sm">Twfido (自然人憑證)</h4>
                    <p className="text-sm text-muted-foreground">
                      狀態: {attestationStatus.twfido.exists ? '[已認證]' : '[未認證]'}
                    </p>
                    {attestationStatus.twfido.exists && (
                      <div className="text-xs font-mono mt-1">
                        地址: {attestationStatus.twfido.address}
                      </div>
                    )}
                  </div>
                )}

                {attestationStatus.twland && (
                  <div className="border rounded p-3">
                    <h4 className="font-medium text-sm">Twland (房產憑證)</h4>
                    <p className="text-sm text-muted-foreground">
                      狀態: {attestationStatus.twland.exists ? '[已認證]' : '[未認證]'}
                    </p>
                    {attestationStatus.twland.exists && (
                      <div className="text-xs font-mono mt-1">
                        地址: {attestationStatus.twland.address}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};