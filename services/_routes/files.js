const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { loadConfig, ensureDirs } = require('../_utils/config');
const { execCmd } = require('../_utils/exec');
const router = express.Router();

const config = loadConfig();
ensureDirs(config);

const upload = multer({ dest: config.tempDir });

// ===== PDF =====

// Merge PDFs
router.post('/pdf/merge', upload.array('files', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length < 2) {
            return res.status(400).json({ error: '至少需要2个PDF文件' });
        }
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const data = fs.readFileSync(file.path);
            const pdf = await PDFDocument.load(data);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        const outputName = `merged_${Date.now()}.pdf`;
        const outputPath = path.join(config.dataDir, outputName);
        fs.writeFileSync(outputPath, await mergedPdf.save());
        // Cleanup uploaded files
        req.files.forEach(f => fs.unlinkSync(f.path));
        res.json({ success: true, file: outputName, path: outputPath, pages: mergedPdf.getPageCount() });
    } catch (err) {
        console.error('[PDF Merge]', err);
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e){} });
        res.status(500).json({ error: 'PDF合并失败: ' + err.message });
    }
});

// Split PDF (extract pages by range, e.g. "1-3,5,7-9")
router.post('/pdf/split', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
        const ranges = req.body.ranges || '1';
        const data = fs.readFileSync(req.file.path);
        const pdf = await PDFDocument.load(data);
        const totalPages = pdf.getPageCount();
        // Parse page ranges: "1-3,5,7-9"
        const pagesToExtract = [];
        ranges.split(',').forEach(part => {
            part = part.trim();
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                for (let i = start; i <= Math.min(end, totalPages); i++) pagesToExtract.push(i - 1);
            } else {
                const n = parseInt(part);
                if (n > 0 && n <= totalPages) pagesToExtract.push(n - 1);
            }
        });
        if (pagesToExtract.length === 0) return res.status(400).json({ error: '无效的页码范围' });
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdf, pagesToExtract);
        pages.forEach(page => newPdf.addPage(page));
        const outputName = `split_${Date.now()}.pdf`;
        const outputPath = path.join(config.dataDir, outputName);
        fs.writeFileSync(outputPath, await newPdf.save());
        fs.unlinkSync(req.file.path);
        res.json({ success: true, file: outputName, path: outputPath, pages: newPdf.getPageCount() });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: 'PDF拆分失败: ' + err.message });
    }
});

// Compress PDF (remove unused objects, optimize)
router.post('/pdf/compress', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
        const data = fs.readFileSync(req.file.path);
        const pdf = await PDFDocument.load(data);
        const originalSize = data.length;
        const compressed = await pdf.save({ useObjectStreams: true });
        const outputName = `compressed_${Date.now()}.pdf`;
        const outputPath = path.join(config.dataDir, outputName);
        fs.writeFileSync(outputPath, compressed);
        fs.unlinkSync(req.file.path);
        const ratio = ((1 - compressed.length / originalSize) * 100).toFixed(1);
        res.json({
            success: true, file: outputName, path: outputPath,
            originalSize, compressedSize: compressed.length,
            ratio: parseFloat(ratio)
        });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: 'PDF压缩失败: ' + err.message });
    }
});

// ===== Image Processing =====

router.post('/image/convert', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片文件' });
        const format = req.body.format || 'png';
        const sharp = require('sharp');
        const outputName = `converted_${Date.now()}.${format}`;
        const outputPath = path.join(config.dataDir, outputName);
        await sharp(req.file.path).toFormat(format).toFile(outputPath);
        const stat = fs.statSync(outputPath);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, file: outputName, path: outputPath, size: stat.size, format });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: '图片转换失败: ' + err.message });
    }
});

router.post('/image/compress', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片文件' });
        const quality = parseInt(req.body.quality) || 80;
        const format = req.body.format || 'jpeg';
        const sharp = require('sharp');
        const originalSize = fs.statSync(req.file.path).size;
        let pipeline = sharp(req.file.path);
        if (format === 'jpeg' || format === 'jpg') pipeline = pipeline.jpeg({ quality });
        else if (format === 'webp') pipeline = pipeline.webp({ quality });
        else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
        const outputName = `compressed_${Date.now()}.${format}`;
        const outputPath = path.join(config.dataDir, outputName);
        await pipeline.toFile(outputPath);
        const compressedSize = fs.statSync(outputPath).size;
        fs.unlinkSync(req.file.path);
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        res.json({
            success: true, file: outputName, path: outputPath,
            originalSize, compressedSize, ratio: parseFloat(ratio), format
        });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: '图片压缩失败: ' + err.message });
    }
});

router.post('/image/resize', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片文件' });
        const width = parseInt(req.body.width) || null;
        const height = parseInt(req.body.height) || null;
        if (!width && !height) return res.status(400).json({ error: '请指定宽度或高度' });
        const sharp = require('sharp');
        const outputName = `resized_${Date.now()}${path.extname(req.file.originalname)}`;
        const outputPath = path.join(config.dataDir, outputName);
        await sharp(req.file.path).resize(width, height, { fit: 'inside', withoutEnlargement: true }).toFile(outputPath);
        const stat = fs.statSync(outputPath);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, file: outputName, path: outputPath, size: stat.size });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: '图片缩放失败: ' + err.message });
    }
});

// ===== Batch Rename =====
router.post('/batch/rename', express.json(), async (req, res) => {
    try {
        const { directory, pattern, replacement, prefix, suffix, startNum } = req.body;
        if (!fs.existsSync(directory)) return res.status(400).json({ error: '目录不存在' });
        const files = fs.readdirSync(directory).filter(f => fs.statSync(path.join(directory, f)).isFile());
        const results = [];
        files.forEach((file, i) => {
            const ext = path.extname(file);
            const base = path.basename(file, ext);
            let newName;
            if (pattern && replacement !== undefined) {
                newName = base.replace(new RegExp(pattern, 'g'), replacement) + ext;
            } else if (prefix) {
                newName = prefix + file;
            } else if (suffix) {
                newName = base + suffix + ext;
            } else if (startNum !== undefined) {
                newName = `${startNum + i}${ext}`;
            } else {
                newName = file;
            }
            if (newName !== file) {
                fs.renameSync(path.join(directory, file), path.join(directory, newName));
                results.push({ old: file, new: newName });
            }
        });
        res.json({ success: true, renamed: results.length, results });
    } catch (err) {
        res.status(500).json({ error: '批量重命名失败: ' + err.message });
    }
});

// ===== Text Processing =====
router.post('/text/replace', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传文本文件' });
        const find = req.body.find || '';
        const replace = req.body.replace || '';
        const encoding = req.body.encoding || 'utf-8';
        let content = fs.readFileSync(req.file.path, encoding);
        const count = (content.match(new RegExp(escapeRegex(find), 'g')) || []).length;
        content = content.replace(new RegExp(escapeRegex(find), 'g'), replace);
        const outputName = `replaced_${Date.now()}${path.extname(req.file.originalname) || '.txt'}`;
        const outputPath = path.join(config.dataDir, outputName);
        fs.writeFileSync(outputPath, content, encoding);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, file: outputName, path: outputPath, count });
    } catch (err) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(e){}
        res.status(500).json({ error: '文本处理失败: ' + err.message });
    }
});

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Download a processed file
router.get('/download/:name', (req, res) => {
    const filePath = path.join(config.dataDir, req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
    res.download(filePath);
});

module.exports = router;
