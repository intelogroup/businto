import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const logFile = path.join(process.cwd(), 'email-preview-urls.txt');
    
    if (!fs.existsSync(logFile)) {
      return NextResponse.json({ 
        urls: [], 
        message: 'No emails sent yet' 
      });
    }
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    const urls: Array<{timestamp: string, recipient: string, url: string}> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d{4}-\d{2}-\d{2}T/)) {
        const [timestamp, recipient] = line.split(' - ');
        const url = lines[i + 1]?.trim();
        if (url && url.startsWith('http')) {
          urls.push({ timestamp, recipient, url });
        }
      }
    }
    
    return NextResponse.json({ urls, count: urls.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read email URLs' }, { status: 500 });
  }
}
