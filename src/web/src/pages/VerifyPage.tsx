import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiService } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Loader2, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export const VerifyPage: React.FC = () => {
  const [holderDid, setHolderDid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const validateDid = (did: string): boolean => {
    return did.startsWith('did:pkh:sol:') && did.length > 15;
  };

  const handleStartVerification = async () => {
    if (!holderDid.trim()) {
      setError('請輸入 Holder DID');
      return;
    }

    if (!validateDid(holderDid)) {
      setError('DID 格式錯誤，應為 did:pkh:sol:{publickey}');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await apiService.startVerification(holderDid);
      
      if (result.success && result.vpRequestUri) {
        // 顯示 QR 碼和連結
        navigate('/result', { 
          state: { 
            vpRequestUri: result.vpRequestUri,
            holderDid,
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHolderDid(value);
    
    // 清除錯誤當用戶開始輸入
    if (error) {
      setError('');
    }
  };

  const isValid = validateDid(holderDid);
  const isEmpty = !holderDid.trim();

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
          <div className="space-y-2">
            <label htmlFor="holderDid" className="text-sm font-medium flex items-center space-x-2">
              <span>Holder DID</span>
              {!isEmpty && (
                isValid ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )
              )}
            </label>
            <Input
              id="holderDid"
              placeholder="did:pkh:sol:..."
              value={holderDid}
              onChange={handleInputChange}
              className={`font-mono text-sm transition-colors ${
                !isEmpty && !isValid 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                  : !isEmpty && isValid
                  ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                  : ''
              }`}
              disabled={loading}
            />
            {!isEmpty && !isValid && (
              <p className="text-xs text-red-600 flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>請輸入有效的 DID 格式</span>
              </p>
            )}
            {!isEmpty && isValid && (
              <p className="text-xs text-green-600 flex items-center space-x-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>DID 格式正確</span>
              </p>
            )}
          </div>
          
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button 
            onClick={handleStartVerification}
            disabled={loading || isEmpty || !isValid}
            className="w-full h-12 text-base font-medium transition-all duration-200"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                啟動中...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                開始驗證
              </>
            )}
          </Button>

          <div className="space-y-3 pt-2">
            <div className="text-xs text-muted-foreground text-center">
              使用者需要透過支援 OID4VP 的錢包完成身份驗證
            </div>
            
            <div className="bg-muted/50 p-3 rounded-lg space-y-2">
              <h4 className="text-xs font-medium">支援的憑證類型：</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>自然人憑證</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>房產憑證</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};