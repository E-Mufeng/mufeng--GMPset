const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { loadConfig, ensureDirs } = require('../_utils/config');
const router = express.Router();

const config = loadConfig();
ensureDirs(config);

const PLAYLIST_FILE = path.join(config.dataDir, 'playlists.json');

// ===== Lazy-load @meting/core (ESM module) =====
let _Meting = null;
async function getMeting() {
    if (!_Meting) {
        const mod = await import('@meting/core');
        _Meting = mod.default;
    }
    return _Meting;
}

// ===== JSON helpers =====

function loadPlaylists() {
    try {
        if (fs.existsSync(PLAYLIST_FILE)) return JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf-8'));
    } catch (e) { console.error('[Music] playlist load error:', e.message); }
    return { playlists: [] };
}

function savePlaylists(data) {
    const dir = path.dirname(PLAYLIST_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function httpGetBuffer(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { timeout: 30000, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    });
}

// ===== Tang API Helper (QQ music full playback) =====
// Uses third-party proxy that handles authentication server-side
const TANG_API = 'https://tang.api.s01s.cn/music_open_api.php';

function tangFetch(params) {
    const qs = Object.entries(params).map(([k,v]) => k+'='+encodeURIComponent(v)).join('&');
    return new Promise((resolve, reject) => {
        https.get(TANG_API+'?'+qs, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let d='';
            res.on('data',c=>d+=c);
            res.on('end',()=>{
                try {
                    resolve(JSON.parse(d));
                } catch(e) {
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            reject(err);
        }).on('timeout', function(){
            this.destroy();
            reject(new Error('tang timeout'));
        });
    });
}

// ===== Meting Helper =====
// Returns platform-specific Meting instance with format=true
async function createMeting(platform, cookie) {
    const Meting = await getMeting();
    const m = new Meting(platform);
    m.format(true);
    if (cookie) m.cookie(cookie);
    return m;
}

// ===== Search resilience: cache + retry + fallback =====
const searchCache = new Map();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 min
const SEARCH_CACHE_MAX = 300;

function cacheSearch(keyword, songs, sources) {
  const k = keyword.toLowerCase().trim();
  searchCache.set(k, { songs, sources, ts: Date.now() });
  if (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
}
function getCachedSearch(keyword) {
  const k = keyword.toLowerCase().trim();
  const hit = searchCache.get(k);
  if (hit && (Date.now() - hit.ts) < SEARCH_CACHE_TTL) return hit;
  return null;
}
async function withRetry(fn, times = 2, delay = 500) {
  let err;
  for (let i = 0; i < times; i++) {
    try { return await fn(); }
    catch (e) { err = e; if (i < times - 1) await new Promise(r => setTimeout(r, delay)); }
  }
  throw err;
}
async function tangSearch(keyword) {
  return withRetry(async () => {
    const t = await tangFetch({ msg: keyword, type: 'json' });
    if (!Array.isArray(t) || t.length === 0) throw new Error('tang empty/limited');
    return t;
  });
}

// ===== Search =====

router.get('/search', async (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) return res.json({ songs: [], count: 0 });

    const platforms = ['tencent', 'kugou', 'kuwo', 'baidu'];
    const platformNames = {
        
        tencent: 'QQ音乐',
        kugou: '酷狗音乐',
        kuwo: '酷我音乐',
        baidu: '百度音乐',
        kugou: '酷狗音乐',
        kuwo: '酷我音乐',
        baidu: '百度音乐',
        qq_direct: 'QQ音乐(完整播放)'
    };

    try {
        const results = await Promise.allSettled([
            // Standard meting-based searches
            ...platforms.map(async (platform) => {
                let songs = [];
                try {
                  const meting = await createMeting(platform);
                  const raw = await withRetry(() => meting.search(keyword, { page: 1, limit: 20 }), 2, 500);
                  songs = JSON.parse(raw);
                  if (!Array.isArray(songs)) songs = [];
                } catch (e) {
                  console.error('[Music] meting search fail [' + platform + ']:', e.message);
                }
                return (songs || []).slice(0, 20).map(s => ({
                    id: `${platform}_${s.url_id || s.id}`,
                    source: platform,
                    sourceId: s.url_id || s.id,
                    title: s.name || '',
                    artist: Array.isArray(s.artist) ? s.artist.join(', ') : (s.artist || ''),
                    album: s.album || '',
                    picId: s.pic_id || '',
                    duration: s.duration || 0,
                    platform: platformNames[platform] || platform
                }));
            }),
            // Tang API (QQ direct - returns full playable URLs including VIP)
            (async () => {
                try {
                    const tangData = await tangSearch(keyword);
                    if (!Array.isArray(tangData) || tangData.length === 0) return [];
                    return tangData.map((s, i) => ({
                        id: `qq_direct_${s.song_mid}`,
                        source: 'qq_direct',
                        sourceId: s.song_mid,
                        title: s.song_title || '',
                        artist: s.singer_name || '',
                        album: s.album_title || '',
                        // Album art from QQ CDN
                        picId: s.album_title ? `qq_direct_${s.song_mid}` : '',
                        duration: s.song_play_time || 0,
                        platform: 'QQ音乐(完整播放)',
                        _pay: s.pay || ''  // Store pay status for display
                    }));
                } catch(e) {
                    console.error('[Music] Tang search error:', e.message);
                    return [];
                }
            })()
        ]);

        const allSongs = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value)
            .filter(s => s.sourceId && s.sourceId !== 'undefined' && s.title);

        // Deduplicate by title+artist - keep ALL variants from different platforms
        // For same title+artist, only deduplicate within the SAME platform to avoid hiding alt sources
        const platformSeen = {};
        const deduped = allSongs.filter(s => {
            if (!platformSeen[s.source]) platformSeen[s.source] = new Set();
            const key = (s.title + s.artist).toLowerCase().trim();
            if (platformSeen[s.source].has(key)) return false;
            platformSeen[s.source].add(key);
            return true;
        });

        const sourcesInfo = results.map((r,i) => ({ source: platforms[i], status: r.status, count: r.status==='fulfilled' ? (r.value||[]).length : 0 }));

        // ===== Resilience: cache on success, fall back to cache when all sources fail =====
        if (deduped.length > 0) {
            cacheSearch(keyword, deduped, sourcesInfo);
            res.json({ songs: deduped, count: deduped.length, keyword, cached: false, sources: sourcesInfo });
        } else {
            const cached = getCachedSearch(keyword);
            if (cached) {
                console.warn('[Music] search empty for "' + keyword + '", serving cached ' + cached.songs.length + ' results');
                res.json({ songs: cached.songs, count: cached.songs.length, keyword, cached: true, sources: cached.sources, notice: '当前音源暂不可达，已展示最近缓存结果' });
            } else {
                res.json({ songs: [], count: 0, keyword, cached: false, sources: sourcesInfo, notice: '当前所有音源暂不可达，请稍后重试' });
            }
        }
    } catch (err) {
        console.error('[Music] Search error:', err.message);
        res.status(500).json({ error: 'Search failed: ' + err.message });
    }
});

// ===== Play URL =====

router.get('/playurl', async (req, res) => {
    const id = req.query.id || '';
    if (!id) return res.status(400).json({ error: 'Missing song ID' });

    const lastUnderscore = id.lastIndexOf('_');
    const source = id.substring(0, lastUnderscore);
    const sourceId = id.substring(lastUnderscore + 1);
    if (!source || !sourceId) return res.status(400).json({ error: 'Invalid song ID format' });

    try {
        // ===== qq_direct: Use tang API (returns full playable URL even for VIP paid songs) =====
        if (source === 'qq_direct') {
            // We need the song title to query tang detail API
            const title = req.query.title || req.query.songTitle || '';
            let tangData;
            try {
                tangData = await tangFetch({ msg: title, type: 'json', mid: sourceId });
            } catch(er) {
                tangData = null;
            }

            if (tangData && tangData.song_play_url) {
                // Prefer lossless (SQ / flac)
                const result = {
                    url: tangData.song_play_url_sq || tangData.song_play_url_pq || tangData.song_play_url_hq || tangData.song_play_url,
                    br: tangData.kbps_sq ? (tangData.kbps_sq * 1000) : (tangData.kbps ? tangData.kbps * 1000 : 128000),
                    quality: tangData.song_play_url_sq ? 'lossless' : (tangData.song_play_url_pq ? 'high' : 'standard'),
                    albumArt: tangData.album_pic || '',
                    duration: tangData.song_play_time || 0
                };
                return res.json(result);
            }

            // Fallback: try searching with mid as keyword
            const searchResult = await tangFetch({ msg: title || '', type: 'json' });
            if (Array.isArray(searchResult) && searchResult.length > 0) {
                const match = searchResult.find(s => s.song_mid === sourceId) || searchResult[0];
                if (match) {
                    const detail = await tangFetch({ msg: match.song_title, type: 'json', mid: match.song_mid });
                    if (detail && detail.song_play_url) {
                        const result = {
                            url: detail.song_play_url_sq || detail.song_play_url_hq || detail.song_play_url,
                            br: detail.kbps_sq ? (detail.kbps_sq * 1000) : (detail.kbps ? detail.kbps * 1000 : 128000),
                            quality: detail.song_play_url_sq ? 'lossless' : 'standard',
                            albumArt: detail.album_pic || ''
                        };
                        return res.json(result);
                    }
                }
            }
            return res.json({ error: 'QQ direct: failed to get play URL' });
        }

        // ===== Standard meting-based sources =====
        const meting = await createMeting(source);
        let data = null;
        
        // Try multiple quality levels
        for (const br of [128, 320, 999]) {
            try {
                const raw = await meting.url(sourceId, br);
                data = JSON.parse(raw);
                if (data?.url) break;
            } catch(e) {}
        }

        if (data?.url) {
            return res.json({ url: data.url, br: data.br || 128000 });
        }

        // tencent (QQ) → fallback to qq_direct which handles VIP
        if (source === 'tencent') {
            try {
                // Search tang API by song title (more reliable than ID matching)
                const title = req.query.title || '';
                if (title) {
                    const tangData = await tangFetch({ msg: title, type: 'json' });
                    if (Array.isArray(tangData) && tangData.length > 0) {
                        // Try exact match first, then first result
                        let match = tangData.find(s => s.song_title === title);
                        if (!match) match = tangData[0];
                        if (match && match.song_mid) {
                            const detail = await tangFetch({ msg: match.song_title, type: 'json', mid: match.song_mid });
                            if (detail && detail.song_play_url) {
                                return res.json({
                                    url: detail.song_play_url_sq || detail.song_play_url_pq || detail.song_play_url_hq || detail.song_play_url,
                                    br: detail.kbps_sq ? (detail.kbps_sq * 1000) : (detail.kbps ? detail.kbps * 1000 : 128000),
                                    fallback: 'qq_direct'
                                });
                            }
                        }
                    }
                }
            } catch(e) {}
        }
        

        res.json({ error: `${source}: song not available (may require subscription)` });
    } catch (err) {
        console.error('[Music] playurl error:', err.message);
        res.status(500).json({ error: 'Failed to get play URL: ' + err.message });
    }
});

// ===== Audio Proxy (streams external URL through backend to avoid CORS/expiry) =====
router.get('/proxy-audio', async (req, res) => {
    const id = req.query.id || '';
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const lastUnderscore = id.lastIndexOf('_');
    const source = id.substring(0, lastUnderscore);
    const sourceId = id.substring(lastUnderscore + 1);
    if (!source || !sourceId) return res.status(400).json({ error: 'Invalid format' });

    try {
        let url = null;

        // ===== qq_direct: Use tang API instead of meting =====
        if (source === 'qq_direct') {
            const title = req.query.title || req.query.songTitle || '';
            const tangData = await tangFetch({ msg: title, type: 'json', mid: sourceId });
            if (tangData) {
                url = tangData.song_play_url_sq || tangData.song_play_url_pq || tangData.song_play_url_hq || tangData.song_play_url;
            }
            if (!url) {
                // Fallback: search + get detail
                const searchResult = await tangFetch({ msg: title || '', type: 'json' });
                if (Array.isArray(searchResult) && searchResult.length > 0) {
                    const match = searchResult.find(s => s.song_mid === sourceId) || searchResult[0];
                    if (match) {
                        const detail = await tangFetch({ msg: match.song_title, type: 'json', mid: match.song_mid });
                        if (detail) url = detail.song_play_url_sq || detail.song_play_url_hq || detail.song_play_url;
                    }
                }
            }
        } else {
            // Standard meting-based URL with multiple quality fallbacks
            const { default: MetingModule } = await import('@meting/core');
            const m = new MetingModule(source);
            m.format(true);
            for (const br of [128, 320, 999]) {
                try {
                    const raw = await m.url(sourceId, br);
                    const data = JSON.parse(raw);
                    if (data?.url) { url = data.url; break; }
                } catch(e) {}
            }
        }

        if (!url) {
            // Fallback: call internal playurl (handles tencent→qq_direct, etc.)
            const playResult = await new Promise((resolve) => {
                http.get(`http://127.0.0.1:${config.backendPort || 8081}/api/music/playurl?id=${encodeURIComponent(id)}&title=${encodeURIComponent(req.query.title || req.query.songTitle || '')}`, (r) => {
                    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } });
                }).on('error', () => resolve({}));
            });
            if (playResult && playResult.url) {
                url = playResult.url;
            } else {
                return res.status(404).json({ error: 'Not available' });
            }
        }

        // Stream the audio through our backend
        const audioReq = require(url.startsWith('https') ? 'https' : 'http').get(url, { rejectUnauthorized: false }, (audioRes) => {
            // Forward headers that make sense
            const headers = {
                'Content-Type': audioRes.headers['content-type'] || 'audio/mpeg',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            };

            // Forward Content-Length so browser knows duration
            if (audioRes.headers['content-length']) {
                headers['Content-Length'] = audioRes.headers['content-length'];
            }
            // Forward Content-Range for seeking support
            if (audioRes.headers['content-range']) {
                headers['Content-Range'] = audioRes.headers['content-range'];
            }

            const statusCode = audioRes.statusCode === 206 ? 206 : 200;
            res.writeHead(statusCode, headers);
            audioRes.pipe(res);
        });

        audioReq.on('error', (err) => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Stream failed: ' + err.message });
            }
        });

        // Timeout after 60s
        audioReq.setTimeout(60000, () => {
            audioReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Stream timeout' });
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Download =====

router.get('/download', async (req, res) => {
    const id = req.query.id || '';
    if (!id) return res.status(400).json({ error: 'Missing song ID' });
    const title = req.query.title || 'unknown';

    try {
        // Get play URL via internal call
        const playResult = await new Promise((resolve) => {
            http.get(`http://127.0.0.1:${config.backendPort || 8081}/api/music/playurl?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`, (r) => {
                let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
            }).on('error', () => resolve({}));
        });

        if (!playResult.url) {
            return res.status(404).json({ error: playResult.error || 'Cannot download' });
        }

        const audioBuffer = await httpGetBuffer(playResult.url);
        const safeName = title.replace(/[<>:"\/\\|?*]/g, '_').substring(0, 100) + '.mp3';
        const filePath = path.join(config.musicDir, safeName);
        fs.writeFileSync(filePath, audioBuffer);

        res.json({ success: true, file: safeName, path: filePath, size: audioBuffer.length, title });
    } catch (err) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
    }
});

// ===== Lyrics =====

router.get('/lyric', async (req, res) => {
    const id = req.query.id || '';
    if (!id) return res.status(400).json({ error: 'Missing song ID' });
    const lastUnderscore = id.lastIndexOf('_');
    const source = id.substring(0, lastUnderscore);
    const sourceId = id.substring(lastUnderscore + 1);
    if (!source || !sourceId) return res.status(400).json({ error: 'Invalid ID format' });

    try {
        // qq_direct: Use meting's tencent source for lyrics (lyrics are free)
        const lyricSource = source === 'qq_direct' ? 'tencent' : source;
        const meting = await createMeting(lyricSource);
        const raw = await meting.lyric(sourceId);
        const data = JSON.parse(raw);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Album Art =====

router.get('/pic/:source/:picId', async (req, res) => {
    try {
        // qq_direct: use QQ CDN pattern directly
        if (req.params.source === 'qq_direct' && req.params.picId.startsWith('qq_direct_')) {
            const songMid = req.params.picId.replace('qq_direct_', '');
            // QQ album art URLs use album_mid, not song_mid - try both patterns
            const qqAlbumUrl = `http://y.gtimg.cn/music/photo_new/T002R500x500M000${songMid}_2.jpg`;
            return res.redirect(qqAlbumUrl);
        }
        const meting = await createMeting(req.params.source);
        const raw = await meting.pic(req.params.picId, 300);
        const data = JSON.parse(raw);
        if (data?.url) {
            return res.redirect(data.url);
        }
        res.json({ error: 'No album art' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Playlist Management =====

router.get('/playlists', (req, res) => res.json(loadPlaylists()));

router.post('/playlists', express.json(), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Enter playlist name' });
    const data = loadPlaylists();
    const id = 'pl_' + Date.now();
    data.playlists.push({ id, name, description: description || '', songs: [], createdAt: new Date().toISOString() });
    savePlaylists(data);
    res.json({ success: true, playlist: data.playlists[data.playlists.length - 1] });
});

router.delete('/playlists/:id', (req, res) => {
    const data = loadPlaylists();
    data.playlists = data.playlists.filter(p => p.id !== req.params.id);
    savePlaylists(data);
    res.json({ success: true });
});

router.post('/playlists/:id/songs', express.json(), (req, res) => {
    const data = loadPlaylists();
    const pl = data.playlists.find(p => p.id === req.params.id);
    if (!pl) return res.status(404).json({ error: 'Playlist not found' });
    const { song } = req.body;
    if (!song) return res.status(400).json({ error: 'Provide song info' });
    if (!song.id) return res.status(400).json({ error: 'Song id required' });
    if (!pl.songs.find(s => s.id === song.id)) {
        const safeSong = {
            id: song.id || '',
            title: song.title || '',
            artist: song.artist || '',
            source: song.source || '',
            sourceId: song.sourceId || song.id?.split('_').slice(1).join('_') || '',
            picId: song.picId || '',
            platform: song.platform || '',
            addedAt: new Date().toISOString()
        };
        pl.songs.push(safeSong);
        console.log('[Music] Added to playlist:', pl.id, safeSong.title);
    } else {
        console.log('[Music] Song already in playlist:', song.id);
    }
    savePlaylists(data);
    res.json({ success: true, playlist: pl });
});

router.delete('/playlists/:plid/songs/:songid', (req, res) => {
    const data = loadPlaylists();
    const pl = data.playlists.find(p => p.id === req.params.plid);
    if (!pl) return res.status(404).json({ error: 'Playlist not found' });
    pl.songs = pl.songs.filter(s => s.id !== req.params.songid);
    savePlaylists(data);
    res.json({ success: true });
});

// ===== Playlist rename =====
router.put('/playlists/:id', express.json(), (req, res) => {
    const data = loadPlaylists();
    const pl = data.playlists.find(p => p.id === req.params.id);
    if (!pl) return res.status(404).json({ error: 'Playlist not found' });
    const { name, description } = req.body;
    if (name) pl.name = name;
    if (description !== undefined) pl.description = description;
    savePlaylists(data);
    res.json({ success: true, playlist: pl });
});

// ===== Local Music =====

router.get('/local', (req, res) => {
    const musicDir = config.musicDir;
    try {
        if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
        const files = fs.readdirSync(musicDir).filter(f => /\.(mp3|flac|wav|ogg|m4a|wma)$/i.test(f));
        const songs = files.map(f => {
            const stat = fs.statSync(path.join(musicDir, f));
            return { id: 'local_' + f.replace(/[^a-zA-Z0-9]/g, '_'), source: 'local', title: path.basename(f, path.extname(f)), artist: '', file: f, path: path.join(musicDir, f), size: stat.size, modifiedAt: stat.mtime.toISOString(), platform: 'Local' };
        });
        res.json({ songs, count: songs.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stream/:file', (req, res) => {
    const filePath = path.join(config.musicDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' }[ext] || 'audio/mpeg';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
