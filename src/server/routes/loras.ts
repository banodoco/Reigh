import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// This serves the loras.json file from the public/data directory
router.get('/wan', async (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'public/data/loras.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    res.json(data);
  } catch (error) {
    console.error('Failed to read or parse loras.json:', error);
    res.status(500).json({ error: 'Could not load LoRA models.' });
  }
});

export default router; 