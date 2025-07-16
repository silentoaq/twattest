import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import verifyRoutes from './routes/verify.ts';
import attestationRoutes from './routes/attestation.ts';
import sdkRoutes from './routes/sdk.ts';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/verify', verifyRoutes);
app.use('/api/attestation', attestationRoutes);
app.use('/api/sdk', sdkRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug: 列出所有路由
app.get('/debug/routes', (req, res) => {
  res.json({
    routes: [
      'GET /health',
      'GET /debug/routes',
      'POST /api/verify/start',
      'GET /api/verify/request/:requestId',
      'POST /api/verify/presentation/:requestId',
      'GET /api/attestation/status/:holderDid',
      'GET /api/sdk/permissions/:holderDid',
      'POST /api/sdk/data-request',
      'GET /api/sdk/data-request/:requestId',
      'POST /api/sdk/data/:requestId'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Twattest API server running on port ${PORT}`);
});