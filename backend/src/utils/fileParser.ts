import mammoth from 'mammoth';
import { logger } from './logger';

/**
 * 从上传文件 buffer 中提取纯文本
 * 支持: .txt .docx .pdf
 */
export async function extractTextFromFile(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const ext = originalName.toLowerCase().split('.').pop() || '';

  switch (ext) {
    case 'txt':
      return buffer.toString('utf-8');

    case 'docx':
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (err) {
        logger.error('Failed to parse docx:', err);
        throw new Error('无法解析 docx 文件');
      }

    case 'pdf':
      try {
        // 动态 require 避免 pdf-parse 模块加载时读取测试文件
        const pdfParse = require('pdf-parse');
        const result = await pdfParse(buffer);
        return result.text;
      } catch (err) {
        logger.error('Failed to parse pdf:', err);
        throw new Error('无法解析 pdf 文件');
      }

    default:
      throw new Error(`不支持的文件格式: .${ext}，仅支持 txt/docx/pdf`);
  }
}
