import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiService, type AttestationStatus } from '@/lib/api';
import { Copy, CheckCircle2, RefreshCw, ArrowLeft, ExternalLink } from 'lucide-react';
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
  const [attestationStatus, setAttestationStatus] = useState<AttestationStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state?.vpRequestUri) {
      navigate('/');
      return;
    }

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('複製失敗:', err);
      const textArea = document.createElement('textarea');
      textArea.value = state.vpRequestUri;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>返回</span>
            </Button>
            <h1 className="text-2xl font-bold">身份驗證</h1>
          </div>
        </div>

        {/* QR Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ExternalLink className="h-5 w-5" />
              <span>等待用戶驗證</span>
            </CardTitle>
            <CardDescription>
              請用戶使用支援 OID4VP 的錢包掃描 QR 碼或開啟連結
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center space-y-4">
              {qrCodeUrl && (
                <div className="p-4 bg-white rounded-lg border">
                  <img 
                    src={qrCodeUrl} 
                    alt="VP Request QR Code" 
                    className="rounded-lg"
                  />
                </div>
              )}
              
              <div className="w-full space-y-2">
                <label className="text-sm font-medium">VP Request URI:</label>
                <div className="flex space-x-2">
                  <input
                    value={state.vpRequestUri}
                    readOnly
                    className="flex-1 text-xs font-mono bg-muted p-3 rounded border focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button 
                    size="sm" 
                    onClick={copyToClipboard}
                    variant={copied ? "default" : "outline"}
                    className={`min-w-[80px] transition-all duration-200 ${
                      copied ? 'bg-green-600 hover:bg-green-700' : ''
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        已複製
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        複製
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground text-center space-y-1 p-3 bg-muted/50 rounded-lg">
                <p><strong>請求 ID:</strong> {state.requestId}</p>
                <p><strong>Holder DID:</strong> {state.holderDid}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5" />
              <span>Attestation 狀態</span>
            </CardTitle>
            <CardDescription>
              查詢此用戶的鏈上認證狀態
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={checkAttestationStatus} 
              disabled={checking}
              className="w-full md:w-auto flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? '查詢中...' : '檢查狀態'}</span>
            </Button>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
               {error}
              </div>
            )}

            {attestationStatus && (
              <div className="space-y-3">
                <h3 className="font-medium text-lg">認證狀態</h3>
                
                {/* Twfido (自然人憑證) */}
                {attestationStatus.twfido && (
                  <div className={`border rounded-lg p-4 ${
                    attestationStatus.twfido.exists 
                      ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' 
                      : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Twfido (自然人憑證)</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        attestationStatus.twfido.exists
                          ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {attestationStatus.twfido.exists ? '已認證' : '未認證'}
                      </span>
                    </div>
                    {attestationStatus.twfido.exists && attestationStatus.twfido.data && (
                      <div className="space-y-2">
                        <div className="text-xs font-mono p-2 bg-white dark:bg-gray-900 rounded border">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">鏈上地址:</div>
                          <div className="break-all mb-2">{attestationStatus.twfido.address}</div>
                          <div className="text-gray-500 dark:text-gray-400 mb-1">憑證參考:</div>
                          <div className="break-all">{attestationStatus.twfido.data.credentialReference}</div>
                        </div>
                        {attestationStatus.twfido.expiry && (
                          <div className="text-xs text-gray-500">
                            過期時間: {new Date(attestationStatus.twfido.expiry * 1000).toLocaleString('zh-TW')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Twland (房產憑證) */}
                {attestationStatus.twland && (
                  <div className={`border rounded-lg p-4 ${
                    attestationStatus.twland.exists 
                      ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' 
                      : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Twland (房產憑證)</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        attestationStatus.twland.exists
                          ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {attestationStatus.twland.exists 
                          ? `已認證 (${attestationStatus.twland.count} 筆)` 
                          : '未認證'}
                      </span>
                    </div>
                    {attestationStatus.twland.exists && attestationStatus.twland.attestations.length > 0 && (
                      <div className="space-y-2">
                        {attestationStatus.twland.attestations.map((attestation, index) => (
                          <div key={index} className="text-xs font-mono p-2 bg-white dark:bg-gray-900 rounded border">
                            <div className="text-gray-500 dark:text-gray-400 mb-1">房產 #{index + 1}:</div>
                            <div className="break-all mb-2">{attestation.address}</div>
                            <div className="text-gray-500 dark:text-gray-400 mb-1">憑證參考:</div>
                            <div className="break-all mb-2">{attestation.data.credentialReference}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs">
                              過期時間: {new Date(attestation.expiry * 1000).toLocaleString('zh-TW')}
                            </div>
                          </div>
                        ))}
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