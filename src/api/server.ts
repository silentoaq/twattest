import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import verifyRoutes from './routes/verify.ts';
import attestationRoutes from './routes/attestation.ts';
import disclosureRoutes from './routes/disclosure.ts';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  const publicPaths = ['/api/verify/', '/api/health', '/api/debug'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  if (!validApiKeys.includes(apiKey as string)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
});

app.use('/api/verify', verifyRoutes);
app.use('/api/attestation', attestationRoutes);
app.use('/api/disclosure', disclosureRoutes);