import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiService } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export const VerifyPage: React.FC = () => {
  const [holderDid, setHolderDid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleStartVerification = async () => {
    if (!holderDid.trim()) {
      setError('請輸入 Holder DID');
      return;
    }

    if (!holderDid.startsWith('did:pkh:sol:')) {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Twattest</CardTitle>
          <CardDescription>
            去中心化身份驗證服務
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="holderDid" className="text-sm font-medium">
              Holder DID
            </label>
            <Input
              id="holderDid"
              placeholder="did:pkh:sol:..."
              value={holderDid}
              onChange={(e) => setHolderDid(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <Button 
            onClick={handleStartVerification}
            disabled={loading}
            className="w-full"
          >
            {loading ? '啟動中...' : '開始驗證'}
          </Button>

          <div className="text-xs text-muted-foreground text-center">
            使用者需要透過支援 OID4VP 的錢包完成身份驗證
          </div>
        </CardContent>
      </Card>
    </div>
  );
};