// 端口感知：当聚创台页面(:8768)嵌入本模块、但音乐 API 在独立端口(:8805)时，
// 直接赋值给 src 的相对路径必须加前缀，否则会错打到 :8768。
const MUSIC_BASE = (typeof window !== 'undefined' && window.__MUSIC_BASE__) || '';

const musicManager = {
    audio: null,
    currentSong: null,
    searchResults: [],
    queue: [],
    qi: -1,
    lyrics: [],
    lrcIdx: -1,
    volBefore: 50,
    muted: false,
    repeatMode: 0, // 0=off 1=one 2=all
    shuffle: false,
    shuffleRadioActive: false,
    _shuffleLoading: false,
    currentPlaylist: null,
    selectedSongs: {}, // id -> song object for multi-select

    // 幂等：聚创台 SPA 每次打开工具都会重建 DOM，故 audio 对象与全局 keydown 只在首次创建，
    // DOM 元素监听每次重新绑定（旧 DOM 已脱离文档，不会重复）。
    init() {
        if (!this.audio) {
            this.audio = new Audio();
            this.audio.volume = 0.5;
            document.body.appendChild(this.audio);

            this.audio.addEventListener('timeupdate', () => this.onTime());
            this.audio.addEventListener('loadedmetadata', () => { document.getElementById('pp-dur').textContent = this.fmt(this.audio.duration); });
            this.audio.addEventListener('ended', () => this.onEnded());
            this.audio.addEventListener('play', () => { document.getElementById('pp-play').textContent = '⏸️'; });
            this.audio.addEventListener('pause', () => { document.getElementById('pp-play').textContent = '▶️'; });
            this.audio.addEventListener('error', () => {
                const errMsg = this.audio.error ? this.audio.error.message || '未知错误' : '加载失败';
                console.warn('[Player] Audio error:', errMsg);
                document.getElementById('pc-title').textContent = (this.currentSong?.title || '歌曲') + ' (不可用)';
                document.getElementById('pc-artist').textContent = '播放失败，自动跳过...';
                setTimeout(() => {
                    if (this.shuffleRadioActive) {
                        this.nextShuffleSong();
                    } else {
                        this.autoNext();
                    }
                }, 1500);
            });
            this.audio.addEventListener('waiting', () => { });

            if (!this._keyBound) {
                document.addEventListener('keydown', e => {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                    if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
                    else if (e.code === 'ArrowLeft') { e.preventDefault(); this.prev(); }
                    else if (e.code === 'ArrowRight') { e.preventDefault(); this.next(); }
                    else if (e.code === 'ArrowUp') { e.preventDefault(); this.changeVol(0.05); }
                    else if (e.code === 'ArrowDown') { e.preventDefault(); this.changeVol(-0.05); }
                    else if (e.code === 'KeyS') { this.shuffle = !this.shuffle; this.updateModeBtns(); }
                    else if (e.code === 'KeyR') { this.repeatMode = (this.repeatMode + 1) % 3; this.updateModeBtns(); }
                    else if (e.code === 'KeyL') { document.getElementById('lyric-wrap')?.classList.toggle('hidden'); }
                    else if (e.code === 'KeyQ' && this.currentSong) { this.addToQueue({ ...this.currentSong }); this.renderQueue(); }
                    else if (e.code === 'KeyD') {
                        if (this.currentSong) {
                            const fakeBtn = { textContent: '⬇️' };
                            this.download(this.currentSong.id, this.currentSong.title, fakeBtn);
                        }
                    }
                });
                this._keyBound = true;
            }
        }

        document.getElementById('ms-btn').addEventListener('click', () => this.doSearch());
        document.getElementById('ms-input').addEventListener('keydown', e => { if (e.key === 'Enter') this.doSearch(); });
        document.getElementById('new-pl').addEventListener('click', () => this.newPlaylist());
        document.getElementById('play-all-btn').addEventListener('click', () => this.playAll());
        document.getElementById('queue-all-btn').addEventListener('click', () => this.queueAll());
        document.getElementById('queue-clear').addEventListener('click', () => this.clearQueue());
        document.getElementById('sel-add-btn').addEventListener('click', () => this.showAddModalMulti());
        document.getElementById('sel-cancel').addEventListener('click', () => this.clearSelection());
        document.getElementById('sel-play').addEventListener('click', () => this.playSelected());

        document.getElementById('pp-shuffle').addEventListener('click', () => { this.shuffle = !this.shuffle; this.updateModeBtns(); });
        document.getElementById('pp-repeat').addEventListener('click', () => { this.repeatMode = (this.repeatMode + 1) % 3; this.updateModeBtns(); });
        document.getElementById('pp-play').addEventListener('click', () => this.toggle());
        document.getElementById('pp-prev').addEventListener('click', () => this.prev());
        document.getElementById('pp-next').addEventListener('click', () => this.next());
        document.getElementById('pp-prog').addEventListener('input', () => {
            if (this.audio.duration) this.audio.currentTime = (document.getElementById('pp-prog').value / 100) * this.audio.duration;
        });
        document.getElementById('pp-vol').addEventListener('input', () => {
            this.audio.volume = document.getElementById('pp-vol').value / 100;
            this.muted = this.audio.volume === 0;
            this.updateVolIcon();
        });
        const collectBtn = document.getElementById('pp-collect');
        if (collectBtn) collectBtn.addEventListener('click', () => {
            if (this.currentSong) this.showAddModal(this.currentSong);
        });

        const lyricBtn = document.getElementById('pp-lyric');
        if (lyricBtn) lyricBtn.addEventListener('click', () => {
            const wrap = document.getElementById('lyric-wrap');
            if (wrap) wrap.classList.toggle('hidden');
        });

        document.getElementById('pp-volbtn').addEventListener('click', () => {
            const v = document.getElementById('pp-vol');
            if (this.muted) { this.audio.volume = this.volBefore / 100; v.value = this.volBefore; this.muted = false; }
            else { this.volBefore = parseInt(v.value) || 50; this.audio.volume = 0; v.value = 0; this.muted = true; }
            this.updateVolIcon();
        });

        document.querySelectorAll('.music-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.music-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.music-body > .music-tab-content').forEach(c => c.classList.remove('active'));
                const tgt = document.getElementById('tab-' + tab.dataset.tab);
                if (tgt) tgt.classList.add('active');
                if (tab.dataset.tab === 'local') this.loadLocal();
                if (tab.dataset.tab === 'queue') this.renderQueue();
            });
        });

        this.loadPlaylists();
        this.updateModeBtns();
        this.loadDiscover();
    },

    fmt(s) {
        if (!s || !isFinite(s)) return '0:00';
        return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    },

    updateVolIcon() {
        const btn = document.getElementById('pp-volbtn');
        const v = this.audio.volume;
        if (this.muted || v === 0) btn.textContent = '🔇';
        else if (v < 0.33) btn.textContent = '🔈';
        else if (v < 0.66) btn.textContent = '🔉';
        else btn.textContent = '🔊';
    },

    updateModeBtns() {
        const sh = document.getElementById('pp-shuffle');
        const rp = document.getElementById('pp-repeat');
        sh.style.opacity = this.shuffle ? '1' : '.4';
        rp.textContent = ['🔁','🔂','🔁'][this.repeatMode];
        rp.style.opacity = this.repeatMode > 0 ? '1' : '.4';
        rp.title = ['循环:关','单曲循环','循环全部'][this.repeatMode];
    },

    doSearch() {
        const q = document.getElementById('ms-input').value.trim();
        if (q) {
            this.saveSearchKw(q);
            this.search(q);
        }
    },

    // ===== Discover Page =====
    loadDiscover() {
        this.loadDiscoverTags();
        this.loadDiscoverRecs();
        this.loadRecentPlays();
        this.loadDiscoverStats();
        this.bindShuffleButton();
    },

    async loadDiscoverRecs() {
        const list = document.getElementById('discover-rec-list');
        if (!list) return;
        const srch = (() => { try { return JSON.parse(localStorage.getItem('music_srch')||'[]'); } catch(e){return [];} })();
        const recent = (() => { try { return JSON.parse(localStorage.getItem('music_recent')||'[]'); } catch(e){return [];} })();
        
        // Pick top artists from history
        const artistCounts = {};
        recent.forEach(s => { if (s.artist) artistCounts[s.artist] = (artistCounts[s.artist]||0)+1; });
        srch.forEach(kw => { artistCounts[kw] = (artistCounts[kw]||0)+2; });
        const top = Object.entries(artistCounts).sort((a,b) => b[1]-a[1]).slice(0, 3).map(e => e[0]);
        
        // Fallback tags if no history
        const fallback = ['周杰伦','邓紫棋','林俊杰'];
        const keywords = top.length > 0 ? top : fallback;
        
        let h = '';
        for (const kw of keywords.slice(0, 2)) {
            try {
                const data = await window.toolbox.api('GET', '/api/music/search?keyword=' + encodeURIComponent(kw) + '&limit=6');
                if (data.songs && data.songs.length > 0) {
                    h += '<div style="margin:4px 0 2px;font-size:11px;color:var(--text2);font-weight:500">🎵 根据「' + this.esc(kw) + '」推荐</div>';
                    data.songs.slice(0, 6).forEach(s => {
                        const badge = {tencent:'qq',kugou:'kg',kuwo:'kw',baidu:'bd',qq_direct:'qq'}[s.source||'']||'qq';
                        h += '<div class="song-item" style="cursor:pointer" data-sid="' + this.esc(s.id) + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + this.esc(s.source||'') + '" data-pic="' + this.esc(s.picId||'') + '">' +
                            '<div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + this.esc(s.artist||'') + '</div></div>' +
                            '<span class="song-badge ' + badge + '">' + (s.platform||'') + '</span>' +
                            '<div class="song-acts"><button class="btn-icon disc-play" title="播放">▶️</button></div></div>';
                    });
                }
            } catch(e){}
        }
        if (!h) {
            list.innerHTML = '<div class="empty-state" style="padding:12px;font-size:11px">搜点歌听听，推荐系统会更懂你</div>';
            return;
        }
        list.innerHTML = h;
        list.querySelectorAll('.disc-play').forEach(btn => {
            const item = btn.closest('.song-item');
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const song = {id:item.dataset.sid,title:item.dataset.title,artist:item.dataset.artist,source:item.dataset.source,picId:item.dataset.pic};
                this.play(song);
            });
        });
        list.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('dblclick', () => {
                const pb = item.querySelector('.disc-play');
                if (pb) pb.click();
            });
            item.addEventListener('contextmenu', e => {
                e.preventDefault();
                const song = {id:item.dataset.sid,title:item.dataset.title,artist:item.dataset.artist,source:item.dataset.source,picId:item.dataset.pic};
                this.showSongMenu(e, song);
            });
        });
    },

    getSearchHistory() {
        try { return JSON.parse(localStorage.getItem('music_srch')||'[]'); } catch(e){return [];}
    },

    saveSearchKw(kw) {
        try {
            let list = this.getSearchHistory();
            list = list.filter(s => s.toLowerCase() !== kw.toLowerCase());
            list.unshift(kw);
            if (list.length > 30) list = list.slice(0, 30);
            localStorage.setItem('music_srch', JSON.stringify(list));
        } catch(e){}
    },

    loadDiscoverTags() {
        const c = document.getElementById('discover-tags');
        if (!c) return;
        
        // Build dynamic tags from search history + recent plays
        const srch = this.getSearchHistory();
        const recent = (() => { try { return JSON.parse(localStorage.getItem('music_recent')||'[]'); } catch(e){return [];} })();
        const artists = [...new Set([...srch, ...recent.map(s => s.artist).filter(Boolean)])].slice(0, 8);
        
        // Popular tags as base, with user's artists at front
        const popular = ['周杰伦','林俊杰','邓紫棋','陈奕迅','王菲','Taylor Swift','告五人','五月天','Adele','周深','蔡依林','李荣浩','薛之谦','张惠妹','苏打绿','张靓颖','刘德华','张学友','Beyond','王力宏'];
        const combined = [...artists, ...popular.filter(t => !artists.some(a => a.toLowerCase() === t.toLowerCase()))].slice(0, 20);
        
        c.innerHTML = combined.map(t => '<span class="discover-tag" data-kw="' + t + '">' + this.esc(t) + '</span>').join('');
        c.querySelectorAll('.discover-tag').forEach(el => {
            el.addEventListener('click', () => {
                document.getElementById('ms-input').value = el.dataset.kw;
                this.doSearch();
            });
        });
    },

    loadRecentPlays() {
        const list = document.getElementById('discover-recent-list');
        if (!list) return;
        try {
            const raw = localStorage.getItem('music_recent');
            const songs = raw ? JSON.parse(raw) : [];
            if (songs.length === 0) {
                list.innerHTML = '<div class="empty-state" style="font-size:11px;padding:16px">播放歌曲后自动记录</div>';
                return;
            }
            let h = '';
            songs.slice(0, 30).forEach(s => {
                const badge = {tencent:'qq',kugou:'kg',kuwo:'kw',baidu:'bd',qq_direct:'qq'}[s.source||'']||'qq';
                h += '<div class="song-item" style="cursor:pointer" data-sid="' + this.esc(s.id) + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + this.esc(s.source||'') + '" data-pic="' + this.esc(s.picId||'') + '">' +
                    '<div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + this.esc(s.artist||'') + '</div></div>' +
                    '<span class="song-badge ' + badge + '"></span>' +
                    '</div>';
            });
            list.innerHTML = h;
            list.querySelectorAll('.song-item').forEach(item => {
                item.addEventListener('click', () => {
                    const song = {id:item.dataset.sid, title:item.dataset.title, artist:item.dataset.artist, source:item.dataset.source, picId:item.dataset.pic};
                    this.play(song);
                });
                item.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    const song = {id:item.dataset.sid, title:item.dataset.title, artist:item.dataset.artist, source:item.dataset.source, picId:item.dataset.pic};
                    this.showSongMenu(e, song);
                });
            });
        } catch(e) { list.innerHTML = '<div class="empty-state" style="font-size:11px">加载失败</div>'; }
    },

    saveRecentPlay(song) {
        try {
            const raw = localStorage.getItem('music_recent');
            let songs = raw ? JSON.parse(raw) : [];
            songs = songs.filter(s => s.id !== song.id);
            songs.unshift({id:song.id, title:song.title, artist:song.artist, source:song.source, picId:song.picId, time:Date.now()});
            if (songs.length > 100) songs = songs.slice(0, 100);
            localStorage.setItem('music_recent', JSON.stringify(songs));
        } catch(e) {}
    },

    async loadDiscoverStats() {
        const body = document.getElementById('discover-stats-body');
        if (!body) return;
        let plCount = 0, localCount = 0;
        try {
            const pl = await window.toolbox.api('GET', '/api/music/playlists');
            plCount = (pl.playlists||[]).length;
        } catch(e){}
        try {
            const loc = await window.toolbox.api('GET', '/api/music/local');
            localCount = loc.count||0;
        } catch(e){}
        body.innerHTML = '<div class="discover-stat"><span class="ds-n">' + plCount + '</span><span class="ds-l">歌单</span></div>'
            + '<div class="discover-stat"><span class="ds-n">' + localCount + '</span><span class="ds-l">本地歌曲</span></div>'
            + '<div class="discover-stat"><span class="ds-n">' + (this.queue.length||0) + '</span><span class="ds-l">队列</span></div>'
            + '<div class="discover-stat"><span class="ds-n">7</span><span class="ds-l">搜索源</span></div>';
    },

    bindShuffleButton() {
        const btn = document.getElementById('shuffle-play-btn');
        if (!btn) return;
        btn.addEventListener('click', () => this.toggleShuffleRadio());
    },

    shuffleRadioActive: false,

    toggleShuffleRadio() {
        if (this.shuffleRadioActive) {
            this.shuffleRadioActive = false;
            this._shuffleLoading = false;
            this.updateShuffleUI();
            return;
        }
        this.shuffleRadioActive = true;
        this.updateShuffleUI();
        this.nextShuffleSong();
    },

    updateShuffleUI() {
        const icon = document.getElementById('shuffle-icon');
        const label = document.getElementById('shuffle-label');
        const desc = document.getElementById('shuffle-desc');
        const status = document.getElementById('shuffle-status');
        const btn = document.getElementById('shuffle-play-btn');
        if (!label) return;
        if (this.shuffleRadioActive) {
            if (icon) icon.textContent = '⏹️';
            if (label) { label.textContent = '停止电台'; label.style.color = 'var(--accent)'; }
            if (desc) desc.textContent = '点击停止随机播放';
            if (btn) btn.style.background = 'var(--bg3)';
        } else {
            if (icon) icon.textContent = '🎲';
            if (label) { label.textContent = '随机电台'; label.style.color = ''; }
            if (desc) desc.textContent = '随机搜索歌曲 → 播放 → 自动下一首 → 无限循环';
            if (status) status.textContent = '';
            if (btn) btn.style.background = '';
        }
    },

    SHUFFLE_TAGS: [
        '流行','摇滚','民谣','古典','电子','爵士','R&B','说唱','轻音乐','纯音乐',
        '周杰伦','林俊杰','邓紫棋','陈奕迅','王菲','李荣浩','薛之谦','许嵩','毛不易',
        '五月天','苏打绿','Taylor Swift','Ed Sheeran','周深','张杰','林宥嘉',
        '华语','粤语','韩语','日语','英文','ACG','古风','后摇','独立音乐',
        '钢琴','吉他','古筝','二胡','小提琴','萨克斯',
        '80后','90后','00后','经典老歌','新歌','翻唱','现场',
        '伤感','治愈','励志','浪漫','DJ','舞曲','电影原声','游戏原声'
    ],

    async nextShuffleSong() {
        if (!this.shuffleRadioActive || this._shuffleLoading) return;
        this._shuffleLoading = true;
        
        const status = document.getElementById('shuffle-status');
        
        // Pick random tag
        const tag = this.SHUFFLE_TAGS[Math.floor(Math.random() * this.SHUFFLE_TAGS.length)];
        if (status) status.textContent = '🔍 搜索: ' + tag + '...';
        
        try {
            const data = await window.toolbox.api('GET', '/api/music/search?keyword=' + encodeURIComponent(tag) + '&limit=10');
            if (!data.songs || data.songs.length === 0) {
                this._shuffleLoading = false;
                // Try another tag
                setTimeout(() => { if (this.shuffleRadioActive) this.nextShuffleSong(); }, 500);
                return;
            }
            
            // Pick random song from results
            const song = data.songs[Math.floor(Math.random() * data.songs.length)];
            const songObj = {id:song.id, title:song.title, artist:song.artist, source:song.source, picId:song.picId, _isShuffleSong: true};
            
            if (status) status.textContent = '🎵 ' + song.title + ' - ' + (song.artist||'未知');
            
            // Play it
            this.play(songObj);
        } catch(e) {
            this._shuffleLoading = false;
            if (status) status.textContent = '❌ 搜索失败，重试中...';
            setTimeout(() => { if (this.shuffleRadioActive) this.nextShuffleSong(); }, 1000);
        }
    },

    async search(keyword) {
        const r = document.getElementById('ms-results');
        r.innerHTML = '<div class="loading">搜索中...</div>';
        const data = await window.toolbox.api('GET', '/api/music/search?keyword=' + encodeURIComponent(keyword));
        if (!data.songs) { r.innerHTML = '<div class="empty-state">搜索失败</div>'; return; }
        this.searchResults = data.songs;

        const srcNames = {tencent:'QQ',kugou:'酷狗',kuwo:'酷我',baidu:'百度',qq_direct:'QQ直连'};
        const sourceInfo = (data.sources||[]).filter(s => s.status==='fulfilled' && s.count>0)
            .map(s => (srcNames[s.source]||s.source)+':'+s.count).join(' ');
        document.getElementById('ms-count').textContent = '共 '+data.count+' 首 | '+sourceInfo;

        if (data.songs.length === 0) { r.innerHTML = '<div class="empty-state">未找到结果</div>'; return; }

        const sc = {};
        data.songs.forEach(s => { sc[s.source] = (sc[s.source]||0)+1; });
        data.songs.sort((a,b) => (sc[b.source]||0) - (sc[a.source]||0));

        let h = '';
        data.songs.forEach(s => { h += this.renderItem(s); });
        r.innerHTML = h;
        r.querySelectorAll('.play-btn').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.play({ id: b.dataset.id, title: b.dataset.title, artist: b.dataset.artist, source: b.dataset.source, picId: b.dataset.pic }); });
        });
        r.querySelectorAll('.add-btn').forEach(b => {
            b.addEventListener('click', e => {
                e.stopPropagation();
                try {
                    const songData = JSON.parse(decodeURIComponent(b.dataset.song));
                    this.showAddModal(songData);
                } catch (err) {
                    console.error('[Music] AddToPlaylist error:', err, 'raw:', b.dataset.song);
                }
            });
        });
        r.querySelectorAll('.dl-btn').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.download(b.dataset.id, b.dataset.title, b); });
        });
        r.querySelectorAll('.q-btn').forEach(b => {
            b.addEventListener('click', e => {
                e.stopPropagation();
                this.addToQueue({id:b.dataset.id,title:b.dataset.title,artist:b.dataset.artist,source:b.dataset.source,picId:b.dataset.pic});
            });
        });
        // Checkbox selection
        r.querySelectorAll('.song-chk').forEach(el => {
            el.addEventListener('click', e => {
                e.stopPropagation();
                const sid = el.dataset.sid;
                if (this.selectedSongs[sid]) {
                    delete this.selectedSongs[sid];
                    el.classList.remove('checked');
                    el.textContent = '☐';
                } else {
                    const song = data.songs.find(s => s.id === sid);
                    if (song) { this.selectedSongs[sid] = song; }
                    el.classList.add('checked');
                    el.textContent = '☑';
                }
                this.updateSelBar();
            });
        });
        // Double-click to play
        r.querySelectorAll('.song-item').forEach(item => {
            const pb = item.querySelector('.play-btn');
            if (pb) item.addEventListener('dblclick', e => { if (!e.target.closest('.btn-icon')) pb.click(); });
            item.addEventListener('contextmenu', e => {
                e.preventDefault();
                const sid = item.dataset.sid;
                const song = data.songs.find(s => s.id === sid);
                if (song) this.showSongMenu(e, song);
            });
        });
        // Show search actions
        document.getElementById('search-actions').classList.remove('hidden');
    },

    renderItem(s) {
        const cover = s.picId ? MUSIC_BASE + '/api/music/pic/' + s.source + '/' + s.picId : '';
        const src = s.source || 'ny';
        const badge = {tencent:'qq',kugou:'kg',kuwo:'kw',baidu:'bd',local:'lc',qq_direct:'qq'}[src] || 'qq';
        const isActive = this.currentSong && this.currentSong.id === s.id;
        const sd = encodeURIComponent(JSON.stringify({id:s.id,title:s.title,artist:s.artist,source:s.source,sourceId:s.sourceId,picId:s.picId,platform:s.platform}));
        const checked = this.selectedSongs[s.id] ? ' checked' : '';
        const album = s.album ? ' · ' + s.album : '';
        const dur = s.duration ? this.fmt(s.duration) : '';
        const quality = s._pay === '1' ? '🔒' : (s._pay === '0' ? '🔓' : '');
        return '<div class="song-item' + (isActive?' active':'') + '" data-sid="' + s.id + '">' +
            '<span class="song-chk' + checked + '" data-sid="' + s.id + '">☐</span>' +
            (cover ? '<img class="song-cover" src="' + cover + '" alt="" loading="lazy" onerror="this.removeAttribute(\'onerror\');this.style.display=\'none\'">' : '<div class="song-cover"></div>') +
            '<div class="song-info"><div class="song-title">' + this.esc(s.title) + quality + '</div><div class="song-artist">' + this.esc(s.artist||'') + album + '</div></div>' +
            '<span class="song-badge ' + badge + '">' + (s.platform||'') + '</span>' +
            '<span class="song-dur">' + dur + '</span>' +
            '<div class="song-acts">' +
            '<button class="btn-icon play-btn" data-id="' + s.id + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + s.source + '" data-pic="' + (s.picId||'') + '" data-pay="' + (s._pay||'') + '" title="播放">▶️</button>' +
            '<button class="btn-icon q-btn" data-id="' + s.id + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + s.source + '" data-pic="' + (s.picId||'') + '" title="加入队列">📋</button>' +
            '<button class="btn-icon add-btn" data-song="' + sd + '" title="收藏到歌单">➕</button>' +
            '<button class="btn-icon dl-btn" data-id="' + s.id + '" data-title="' + this.esc(s.title) + '" title="下载">⬇️</button>' +
            '</div></div>';
    },

    esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; },

    // ===== Queue Management =====
    addToQueue(song) {
        this.queue.push(song);
        this.renderQueue();
    },

    removeFromQueue(idx) {
        this.queue.splice(idx, 1);
        if (idx <= this.qi && this.qi > 0) this.qi--;
        this.renderQueue();
    },

    clearQueue() {
        this.queue = [];
        this.qi = -1;
        this.renderQueue();
    },

    renderQueue() {
        const el = document.getElementById('queue-list');
        document.getElementById('queue-info').textContent = this.queue.length + '首歌';
        if (this.queue.length === 0) {
            el.innerHTML = '<div class="empty-state"><div style="font-size:32px;opacity:.5">📋</div><div style="margin-top:6px">队列为空</div></div>';
            return;
        }
        let h = '';
        this.queue.forEach((s, i) => {
            const active = i === this.qi ? ' active' : '';
            h += '<div class="song-item' + active + '" draggable="true" data-qidx="' + i + '">' +
                '<span class="q-drag" title="拖拽调整顺序">⠿</span>' +
                '<div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + (i===this.qi?'▶️  ':'') + this.esc(s.artist||'') + '</div></div>' +
                '<div class="song-acts">' +
                '<button class="btn-icon q-play" data-id="' + s.id + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + (s.source||'') + '" data-pic="' + (s.picId||'') + '" data-idx="' + i + '" title="播放">▶️</button>' +
                '<button class="btn-icon q-del" data-idx="' + i + '" title="移除">✕</button>' +
                '</div></div>';
        });
        el.innerHTML = h;
        el.querySelectorAll('.q-play').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.playQueue(parseInt(b.dataset.idx)); });
        });
        el.querySelectorAll('.q-del').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.removeFromQueue(parseInt(b.dataset.idx)); });
        });
        // Drag & drop to reorder
        let dragSrc = null;
        el.querySelectorAll('.song-item[draggable]').forEach(item => {
            item.addEventListener('dragstart', e => {
                dragSrc = parseInt(item.dataset.qidx);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                el.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                dragSrc = null;
            });
            item.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                item.classList.add('drag-over');
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', e => {
                e.preventDefault();
                item.classList.remove('drag-over');
                if (dragSrc === null || dragSrc === parseInt(item.dataset.qidx)) return;
                const dst = parseInt(item.dataset.qidx);
                const [moved] = this.queue.splice(dragSrc, 1);
                this.queue.splice(dst, 0, moved);
                // Adjust qi
                if (dragSrc === this.qi) this.qi = dst;
                else if (dragSrc < this.qi && dst >= this.qi) this.qi--;
                else if (dragSrc > this.qi && dst <= this.qi) this.qi++;
                this.renderQueue();
            });
        });
    },

    // ===== Search actions =====
    playAll() {
        if (this.searchResults.length === 0) return;
        this.queue = [...this.searchResults];
        this.qi = 0;
        this.renderQueue();
        this.play(this.queue[0]);
    },

    queueAll() {
        if (this.searchResults.length === 0) return;
        this.queue = [...this.queue, ...this.searchResults];
        this.renderQueue();
    },

    // ===== Multi-Select =====
    clearSelection() {
        this.selectedSongs = {};
        document.getElementById('sel-bar').classList.add('hidden');
        document.querySelectorAll('.song-chk').forEach(el => {
            el.classList.remove('checked');
            el.textContent = '☐';
        });
    },

    updateSelBar() {
        const ids = Object.keys(this.selectedSongs);
        const bar = document.getElementById('sel-bar');
        if (ids.length === 0) { bar.classList.add('hidden'); return; }
        bar.classList.remove('hidden');
        document.getElementById('sel-count').textContent = '已选择 ' + ids.length + ' 首';
    },

    showAddModalMulti() {
        const songs = Object.values(this.selectedSongs);
        if (songs.length === 0) return;
        const modal = document.getElementById('modal');
        document.getElementById('mt').textContent = '批量添加到歌单';
        document.getElementById('mb').innerHTML = '<div class="loading" style="padding:16px">加载歌单...</div>';
        modal.classList.remove('hidden');
        
        const mc = document.getElementById('mc');
        const mcNew = mc.cloneNode(true);
        mc.parentNode.replaceChild(mcNew, mc);
        mcNew.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', function(ev) { if (ev.target === modal) modal.classList.add('hidden'); }, {once:true});
        
        window.toolbox.api('GET', '/api/music/playlists').then(r => {
            const pls = r.playlists || [];
            let h = '<div style="margin-bottom:8px;font-size:12px;color:var(--text2)">同时添加到：</div><div class="playlist-picker">';
            if (pls.length === 0) {
                h += '<div style="padding:8px;font-size:11px;color:var(--text3)">暂无歌单</div>';
            } else {
                pls.forEach(pl => {
                    h += '<div class="playlist-picker-item batch-pl-item" data-plid="' + pl.id + '"><span style="font-size:11px;color:var(--text3)">' + (pl.songs?.length||0) + '首</span><span>' + this.esc(pl.name) + '</span></div>';
                });
            }
            h += '</div><div class="playlist-picker-new batch-new-pl">+ 新建歌单</div>';
            h += '<div style="margin-top:8px;font-size:11px;color:var(--text3)">将 ' + songs.length + ' 首歌曲添加到</div>';
            document.getElementById('mb').innerHTML = h;
            
            document.getElementById('mb').addEventListener('click', async (ev) => {
                const item = ev.target.closest('.batch-pl-item');
                if (item) {
                    const plId = item.dataset.plid;
                    // Batch add all selected songs
                    for (const song of songs) {
                        await this.addToPl(plId, song);
                    }
                    this.loadPlaylists();
                    this.clearSelection();
                    modal.classList.add('hidden');
                    return;
                }
                const newBtn = ev.target.closest('.batch-new-pl');
                if (newBtn) {
                    const n = prompt('歌单名称：');
                    if (n) {
                        const rr = await window.toolbox.api('POST', '/api/music/playlists', {name:n});
                        if (rr.success) {
                            for (const song of songs) {
                                await this.addToPl(rr.playlist.id, song);
                            }
                            this.loadPlaylists();
                            this.clearSelection();
                            modal.classList.add('hidden');
                        }
                    }
                }
            }, {once: true});
        });
    },

    playSelected() {
        const songs = Object.values(this.selectedSongs);
        if (songs.length === 0) return;
        this.queue = songs;
        this.qi = 0;
        this.renderQueue();
        this.play(songs[0]);
        this.clearSelection();
    },

    // ===== Playback =====
    async play(song) {
        if (!song || !song.id) return;
        // 互斥锁：手动播放单曲时自动关停随机电台
        if (this.shuffleRadioActive && song.id && !song._isShuffleSong) {
            this.shuffleRadioActive = false;
            this._shuffleLoading = false;
            this.updateShuffleUI();
            if (this.audio) { this.audio.pause(); this.audio.src = ''; }
        }
        try {
            this.currentSong = song;
            const bar = document.getElementById('player-bar');
            bar.classList.remove('hidden');
            document.getElementById('pc-title').textContent = song.title || '';
            document.getElementById('pc-artist').textContent = '';

            document.getElementById('pp-prog').value = 0;
            document.getElementById('pp-cur').textContent = '0:00';
            document.getElementById('pp-dur').textContent = '...';

            document.getElementById('pc-cover').src = song.picId ? MUSIC_BASE + '/api/music/pic/' + song.source + '/' + song.picId : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"%3E%3Crect fill="%2322222e" width="48" height="48"/%3E%3Ctext x="24" y="32" text-anchor="middle" fill="%23606078" font-size="20"%3E♪%3C/text%3E%3C/svg%3E';

            document.querySelectorAll('.song-item.active').forEach(el => el.classList.remove('active'));
            const al = document.querySelector('#ms-results .play-btn[data-id="' + song.id.replace(/["\\]/g, '') + '"]');
            if (al) al.closest('.song-item').classList.add('active');
            this.renderQueue();

            if (song.id.startsWith('local_')) {
                this.audio.src = MUSIC_BASE + '/api/music/stream/' + encodeURIComponent(song.id.replace('local_','').replace(/_/g,'.'));
                this.audio.load();
                this.hideLyric();
                try { await this.audio.play(); } catch(e) {}
                return;
            }

            document.getElementById('pc-artist').textContent = '连接中...';
            this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            this.audio.load();
            this.audio.play().catch(() => {});

            // 传title给后端，让meting失败时可回退到tang搜索
            const extraParams = '&title=' + encodeURIComponent(song.title || '');
            const data = await window.toolbox.api('GET', '/api/music/playurl?id=' + encodeURIComponent(song.id) + extraParams);
            if (!data || !data.url) {
                this._shuffleLoading = false;
                document.getElementById('pc-title').textContent = song.title + ' (不可用)';
                document.getElementById('pc-artist').textContent = (data?.error || '该平台不支持') + ' 试试其他来源';
                if (this.shuffleRadioActive) { setTimeout(() => this.nextShuffleSong(), 500); }
                return;
            }

            if (data.albumArt) document.getElementById('pc-cover').src = data.albumArt;

            document.getElementById('pc-artist').textContent = song.artist || '';
            this.audio.src = MUSIC_BASE + '/api/music/proxy-audio?id=' + encodeURIComponent(song.id) + extraParams;
            this.audio.load();
            try { await this.audio.play(); } catch(e) {
                console.warn('[Player] Play failed:', e.message);
                await new Promise(r => setTimeout(r, 800));
                try { await this.audio.play(); } catch(e2) {
                    document.getElementById('pc-title').textContent = song.title + ' (播放失败)';
                    document.getElementById('pc-artist').textContent = '自动跳过...';
                    // 队列模式自动跳下一首
                    if (this.queue.length > 0 && this.qi >= 0) {
                        setTimeout(() => { if (!this.shuffleRadioActive) this.autoNext(); }, 800);
                    }
                }
            }
            if (this.shuffleRadioActive) {
                this._shuffleLoading = false;
                // 如果播放失败（无声WAV已结束，真实URL没播起来），手动触发下一首
                if (this.audio.paused || this.audio.error) {
                    setTimeout(() => { if (this.shuffleRadioActive) this.nextShuffleSong(); }, 600);
                }
            }

            this.loadLyric(song);
            this.saveRecentPlay(song);
        } catch (err) {
            console.error('[Player] Error:', err);
            if (this.shuffleRadioActive) { this._shuffleLoading = false; setTimeout(() => this.nextShuffleSong(), 1000); }
            document.getElementById('pc-title').textContent = '出错';
        }
    },

    toggle() {
        if (!this.audio.src) return;
        if (this.audio.paused) this.audio.play().catch(() => {});
        else this.audio.pause();
    },

    changeVol(delta) {
        const v = document.getElementById('pp-vol');
        let nv = this.audio.volume + delta;
        nv = Math.max(0, Math.min(1, nv));
        this.audio.volume = nv;
        v.value = Math.round(nv * 100);
        this.muted = nv === 0;
        this.updateVolIcon();
    },

    onEnded() {
        document.getElementById('pp-play').textContent = '▶️';
        if (this.shuffleRadioActive) {
            this.nextShuffleSong();
            return;
        }
        if (this.repeatMode === 1) {
            // Repeat one
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
            return;
        }
        this.autoNext();
    },

    autoNext() {
        if (this.queue.length === 0) return;
        let ni;
        if (this.shuffle) {
            ni = Math.floor(Math.random() * this.queue.length);
        } else {
            ni = this.qi + 1;
            if (ni >= this.queue.length) {
                if (this.repeatMode === 2) ni = 0;
                else return;
            }
        }
        this.playQueue(ni);
    },

    next() {
        if (this.shuffleRadioActive) { this.nextShuffleSong(); return; }
        if (this.queue.length === 0) return;
        let ni;
        if (this.shuffle) {
            ni = Math.floor(Math.random() * this.queue.length);
            if (ni === this.qi && this.queue.length > 1) ni = (ni + 1) % this.queue.length;
        } else {
            ni = this.qi + 1;
            if (ni >= this.queue.length) {
                if (this.repeatMode === 2) ni = 0;
                else return;
            }
        }
        this.playQueue(ni);
    },

    prev() {
        if (this.shuffleRadioActive) { this.nextShuffleSong(); return; }
        if (this.queue.length === 0) return;
        let pi = this.qi - 1;
        if (pi < 0) {
            if (this.repeatMode === 2) pi = this.queue.length - 1;
            else return;
        }
        this.playQueue(pi);
    },

    playQueue(i) {
        if (i < 0 || i >= this.queue.length) return;
        this.qi = i;
        this.play(this.queue[i]);
    },

    // ===== Lyrics =====
    async loadLyric(song) {
        this.lyrics = [];
        this.lrcIdx = -1;
        if (!song.source || song.source === 'local') { this.hideLyric(); return; }
        try {
            const d = await window.toolbox.api('GET', '/api/music/lyric?id=' + encodeURIComponent(song.id));
            if (d.lyric) {
                this.lyrics = this.parseLrc(d.lyric);
                if (this.lyrics.length > 0) { this.showLyric(); this.renderLyric(); }
                else this.hideLyric();
            } else this.hideLyric();
        } catch(e) { this.hideLyric(); }
    },

    parseLrc(t) {
        if (!t) return [];
        const r = [];
        t.split('\n').forEach(l => {
            const m = l.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (m) {
                const sec = parseInt(m[1])*60 + parseInt(m[2]) + (m[3].length===2?parseInt(m[3])*10:parseInt(m[3]))/1000;
                const txt = m[4].trim();
                if (txt) r.push({time:sec,text:txt});
            }
        });
        r.sort((a,b) => a.time - b.time);
        return r;
    },

    showLyric() { document.getElementById('lyric-wrap').classList.remove('hidden'); },
    hideLyric() { document.getElementById('lyric-wrap').classList.add('hidden'); document.getElementById('lyric-content').innerHTML = ''; },
    renderLyric() {
        document.getElementById('lyric-content').innerHTML = this.lyrics.map((l,i) => '<div class="lrc-line" data-lx="' + i + '">' + this.esc(l.text) + '</div>').join('');
    },

    onTime() {
        const d = this.audio.duration;
        if (d && isFinite(d) && d > 0) {
            document.getElementById('pp-prog').value = (this.audio.currentTime / d) * 100;
        }
        document.getElementById('pp-cur').textContent = this.fmt(this.audio.currentTime);
        if (this.lyrics && this.lyrics.length > 0) {
            const ct = this.audio.currentTime;
            let idx = -1;
            for (let i = this.lyrics.length - 1; i >= 0; i--) {
                if (ct >= this.lyrics[i].time) { idx = i; break; }
            }
            if (idx !== this.lrcIdx) {
                const c = document.getElementById('lyric-content');
                c.querySelectorAll('.lrc-line.active').forEach(el => el.classList.remove('active'));
                if (idx >= 0) {
                    const el = c.querySelector('.lrc-line[data-lx="' + idx + '"]');
                    if (el) { el.classList.add('active'); el.scrollIntoView({block:'center',behavior:'smooth'}); }
                }
                this.lrcIdx = idx;
            }
        }
    },

    // ===== Download =====
    async download(id, title, btn) {
        const chk = await window.toolbox.api('GET', '/api/music/playurl?id=' + encodeURIComponent(id));
        if (chk.error) { btn.textContent = '❌'; setTimeout(()=>{if(btn)btn.textContent='⬇️';},2000); return; }
        btn.textContent = '⏳';
        btn.disabled = true;
        const d = await window.toolbox.api('GET', '/api/music/download?id=' + encodeURIComponent(id) + '&title=' + encodeURIComponent(title));
        if (d.success) { btn.textContent = '✅'; setTimeout(()=>{if(btn){btn.textContent='⬇️';btn.disabled=false;}},2000); this.loadLocal(); }
        else { btn.textContent = '❌'; setTimeout(()=>{if(btn){btn.textContent='⬇️';btn.disabled=false;}},2000); }
    },

    // ===== Playlists =====
    async loadPlaylists() {
        const r = await window.toolbox.api('GET', '/api/music/playlists');
        const list = document.getElementById('pl-items');
        if (!r.playlists || r.playlists.length === 0) { list.innerHTML = '<div class="empty-state" style="padding:10px;font-size:11px">暂无</div>'; return; }
        list.innerHTML = '';
        r.playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'pl-item' + (this.currentPlaylist === pl.id ? ' active' : '');
            item.innerHTML = '<span class="pln">' + this.esc(pl.name) + '</span>'
                + '<div class="pl-actions">'
                + '<span class="plc">' + (pl.songs?.length||0) + '</span>'
                + '<button class="btn-icon pl-act-rename" data-plid="' + pl.id + '" title="重命名" style="font-size:10px">✏️</button>'
                + '<button class="btn-icon pl-act-delete" data-plid="' + pl.id + '" title="删除" style="font-size:10px">🗑️</button>'
                + '</div>';
            item.querySelector('.pln').addEventListener('click', () => this.selectPl(pl));
            item.querySelector('.pl-act-rename').addEventListener('click', async (e) => {
                e.stopPropagation();
                const n = prompt('重命名歌单：', pl.name);
                if (n && n !== pl.name) {
                    await window.toolbox.api('PUT', '/api/music/playlists/' + pl.id, { name: n });
                    this.loadPlaylists();
                    if (this.currentPlaylist === pl.id) { pl.name = n; this.selectPl(pl); }
                }
            });
            item.querySelector('.pl-act-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('确认删除歌单「' + pl.name + '」？')) {
                    await window.toolbox.api('DELETE', '/api/music/playlists/' + pl.id);
                    this.currentPlaylist = null;
                    this.loadPlaylists();
                    document.getElementById('pl-songs').innerHTML = '<div class="empty-state">选择一个歌单</div>';
                }
            });
            // Right-click context menu (alternative)
            item.addEventListener('contextmenu', e => { e.preventDefault(); this.showPlMenu(e, pl); });
            list.appendChild(item);
        });
    },

    showPlMenu(e, pl) {
        const modal = document.getElementById('modal');
        document.getElementById('mt').textContent = pl.name;
        document.getElementById('mb').innerHTML = '<div style="padding:4px 0"><div class="pl-menu-item" data-act="rename"><span>✏️ 重命名</span></div><div class="pl-menu-item" data-act="delete"><span>🗑️ 删除</span></div></div>';
        modal.classList.remove('hidden');
        
        const mc = document.getElementById('mc');
        const mcNew = mc.cloneNode(true);
        mc.parentNode.replaceChild(mcNew, mc);
        mcNew.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', function(ev) { if (ev.target === modal) modal.classList.add('hidden'); }, {once:true});
        
        // Delegation for menu items
        document.getElementById('mb').addEventListener('click', async (ev) => {
            const rename = ev.target.closest('[data-act="rename"]');
            if (rename) {
                const n = prompt('新名称：', pl.name);
                if (n && n !== pl.name) {
                    await window.toolbox.api('PUT', '/api/music/playlists/' + pl.id, { name: n });
                    this.loadPlaylists();
                    if (this.currentPlaylist === pl.id) { pl.name = n; this.selectPl(pl); }
                }
                modal.classList.add('hidden');
                return;
            }
            const del = ev.target.closest('[data-act="delete"]');
            if (del) {
                if (confirm('确认删除歌单「' + pl.name + '」？')) {
                    await window.toolbox.api('DELETE', '/api/music/playlists/' + pl.id);
                    this.currentPlaylist = null;
                    this.loadPlaylists();
                    document.getElementById('pl-songs').innerHTML = '<div class="empty-state">选择一个歌单</div>';
                }
                modal.classList.add('hidden');
            }
        }, {once: true});
    },

    async newPlaylist() {
        const name = prompt('歌单名称：');
        if (!name) return;
        const r = await window.toolbox.api('POST', '/api/music/playlists', {name});
        if (r.success) { this.currentPlaylist = r.playlist.id; this.loadPlaylists(); this.selectPl(r.playlist); }
    },

    async selectPl(pl) {
        this.currentPlaylist = pl.id;
        document.querySelectorAll('.pl-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.pl-item').forEach(el => { if (el.querySelector('.pln')?.textContent === pl.name) el.classList.add('active'); });
        const sl = document.getElementById('pl-songs');
        
        // Common header with rename/delete
        let h = '<div class="panel-hdr" style="margin-bottom:8px"><h3>' + this.esc(pl.name) + '</h3>'
            + '<div class="btn-group">'
            + '<button id="pl-play-all-btn" class="btn btn-sm btn-ghost">▶️ 播放全部</button>'
            + '<button id="pl-rename-btn" class="btn-icon" title="重命名">✏️</button>'
            + '<button id="pl-delete-btn" class="btn-icon" title="删除歌单">🗑️</button>'
            + '<span style="font-size:11px;color:var(--text3)">' + (pl.songs?.length||0) + '首</span>'
            + '</div></div>';
        
        if (!pl.songs || pl.songs.length === 0) {
            h += '<div class="empty-state"><div style="font-size:32px;opacity:.5">🎵</div><div style="margin-top:6px">歌单为空</div></div>';
            sl.innerHTML = h + this.plSearchHtml();
            this.bindPlActions(pl, sl);
            this.initPlSearch(pl);
            return;
        }
        pl.songs.forEach(s => {
            const cover = s.picId ? MUSIC_BASE + '/api/music/pic/' + s.source + '/' + s.picId : '';
            const badge = {tencent:'qq',kugou:'kg',kuwo:'kw',baidu:'bd',local:'lc'}[s.source]||'qq';
            h += '<div class="song-item">' +
                (cover ? '<img class="song-cover" src="' + cover + '" loading="lazy" onerror="this.removeAttribute(\'onerror\');this.style.display=\'none\'">' : '<div class="song-cover"></div>') +
                '<div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + this.esc(s.artist||'') + '</div></div>' +
                '<span class="song-badge ' + badge + '">' + (s.platform||'') + '</span>' +
                '<div class="song-acts">' +
                (s.id ? '<button class="btn-icon pl-play" data-id="' + s.id + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + (s.source||'') + '" data-pic="' + (s.picId||'') + '">▶️</button>' : '') +
                '<button class="btn-icon pl-del" data-plid="' + pl.id + '" data-sid="' + (s.id||'') + '">🗑️</button>' +
                '</div></div>';
        });
        sl.innerHTML = h + this.plSearchHtml();
        this.bindPlActions(pl, sl);
        this.initPlSearch(pl);
    },

    plSearchHtml() {
        return '<div class="pl-search-box"><input type="text" id="pl-si" placeholder="搜索歌曲添加到歌单..."><button id="pl-sb" class="btn btn-sm">🔍 搜索</button></div><div id="pl-sr"></div>';
    },

    initPlSearch(pl) {
        const inp = document.getElementById('pl-si');
        if (!inp) return;
        const btn = document.getElementById('pl-sb');
        const doSearch = () => {
            const q = inp.value.trim();
            if (q) this.searchAndAddToPl(pl, q);
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
        btn.addEventListener('click', doSearch);
    },

    async searchAndAddToPl(pl, keyword) {
        const sr = document.getElementById('pl-sr');
        sr.innerHTML = '<div class="loading">搜索中...</div>';
        const data = await window.toolbox.api('GET', '/api/music/search?keyword=' + encodeURIComponent(keyword));
        if (!data.songs || data.songs.length === 0) { sr.innerHTML = '<div class="empty-state">未找到结果</div>'; return; }
        let h = '<div class="pl-sr-hdr">搜索结果 — 点击➕添加到歌单</div>';
        data.songs.slice(0, 20).forEach(s => {
            const cover = s.picId ? MUSIC_BASE + '/api/music/pic/' + s.source + '/' + s.picId : '';
            const badge = {tencent:'qq',kugou:'kg',kuwo:'kw',baidu:'bd',qq_direct:'qq'}[s.source]||'qq';
            const already = pl.songs && pl.songs.some(x => x.id === s.id);
            h += '<div class="song-item pl-sr-item"' +
                ' data-sid="' + s.id + '" data-title="' + this.esc(s.title) + '" data-artist="' + this.esc(s.artist||'') + '" data-source="' + (s.source||'') + '" data-pic="' + (s.picId||'') + '">' +
                (cover ? '<img class="song-cover" src="' + cover + '" onerror="this.removeAttribute(\'onerror\');this.style.display=\'none\'">' : '<div class="song-cover"></div>') +
                '<div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + this.esc(s.artist||'') + '</div></div>' +
                '<span class="song-badge ' + badge + '">' + (s.platform||'') + '</span>' +
                '<div class="song-acts">' +
                (already ? '<span style="font-size:10px;color:var(--green)">已添加</span>' : '<button class="btn-icon pl-sr-add" title="添加到歌单">➕</button>') +
                '</div></div>';
        });
        sr.innerHTML = h;
        sr.querySelectorAll('.pl-sr-add').forEach(b => {
            const item = b.closest('.pl-sr-item');
            b.addEventListener('click', async (e) => {
                e.stopPropagation();
                const song = {id:item.dataset.sid, title:item.dataset.title, artist:item.dataset.artist, source:item.dataset.source, picId:item.dataset.pic};
                await this.addToPl(pl.id, song);
                b.textContent = '✅';
                b.disabled = true;
                if (this.currentPlaylist === pl.id) {
                    const d = await window.toolbox.api('GET', '/api/music/playlists');
                    const updated = d.playlists?.find(p => p.id === pl.id);
                    if (updated) this.selectPl(updated);
                }
            });
        });
        // Also support double-click to add
        sr.querySelectorAll('.pl-sr-item').forEach(item => {
            const addBtn = item.querySelector('.pl-sr-add');
            if (addBtn && !addBtn.disabled) {
                item.addEventListener('dblclick', () => addBtn.click());
            }
        });
        // Right-click context on search results (for playing)
        sr.querySelectorAll('.pl-sr-item').forEach(item => {
            item.addEventListener('contextmenu', e => {
                e.preventDefault();
                const song = {id:item.dataset.sid, title:item.dataset.title, artist:item.dataset.artist, source:item.dataset.source, picId:item.dataset.pic};
                this.showSongMenu(e, song, {pl});
            });
        });
    },

    showSongMenu(e, song, opts = {}) {
        const modal = document.getElementById('modal');
        document.getElementById('mt').textContent = this.esc(song.title) + ' - ' + this.esc(song.artist||'');
        let items = [
            {label:'▶️ 播放', act:'play'},
            {label:'📋 加入队列', act:'queue'},
            {label:'➕ 添加到歌单', act:'addpl'},
            {label:'⬇️ 下载', act:'download'},
        ];
        let h = items.map(it => '<div class="pl-menu-item" data-act="' + it.act + '"><span>' + it.label + '</span></div>').join('');
        document.getElementById('mb').innerHTML = h;
        modal.classList.remove('hidden');
        const mc = document.getElementById('mc');
        const mcNew = mc.cloneNode(true);
        mc.parentNode.replaceChild(mcNew, mc);
        mcNew.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', function(ev) { if (ev.target === modal) modal.classList.add('hidden'); }, {once:true});
        document.getElementById('mb').addEventListener('click', async (ev) => {
            const act = ev.target.closest('[data-act]');
            if (!act) return;
            modal.classList.add('hidden');
            switch (act.dataset.act) {
                case 'play': this.play(song); break;
                case 'queue': this.addToQueue(song); this.renderQueue(); break;
                case 'addpl': this.showAddModal(song); break;
                case 'download': {
                    const btn = {textContent:'⬇️'};
                    await this.download(song.id, song.title, btn);
                    break;
                }
            }
        }, {once: true});
    },

    // Bind playlist header actions + song events
    bindPlActions(pl, sl) {
        sl.querySelectorAll('.pl-play').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.play({id:b.dataset.id,title:b.dataset.title,artist:b.dataset.artist,source:b.dataset.source,picId:b.dataset.pic}); });
        });
        sl.querySelectorAll('.pl-del').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.delFromPl(b.dataset.plid, b.dataset.sid); });
        });
        // Double-click to play
        sl.querySelectorAll('.song-item').forEach(item => {
            const pb = item.querySelector('.pl-play');
            if (pb) item.addEventListener('dblclick', e => { if (!e.target.closest('.btn-icon')) pb.click(); });
        });
        // Right-click context menu on playlist songs
        sl.querySelectorAll('.song-item').forEach(item => {
            const pb = item.querySelector('.pl-play');
            if (pb) {
                item.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    const song = {id:pb.dataset.id,title:pb.dataset.title,artist:pb.dataset.artist,source:pb.dataset.source,picId:pb.dataset.pic};
                    this.showSongMenu(e, song, {pl});
                });
            }
        });
        const playAllBtn = sl.querySelector('#pl-play-all-btn');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                const songs = pl.songs && pl.songs.filter(s => s.id);
                if (songs && songs.length > 0) {
                    this.queue = songs.map(s => ({id:s.id,title:s.title,artist:s.artist,source:s.source,picId:s.picId}));
                    this.qi = 0;
                    this.renderQueue();
                    this.play(this.queue[0]);
                }
            });
        }
        const renameBtn = sl.querySelector('#pl-rename-btn');
        if (renameBtn) {
            renameBtn.addEventListener('click', async () => {
                const n = prompt('重命名歌单：', pl.name);
                if (n && n !== pl.name) {
                    await window.toolbox.api('PUT', '/api/music/playlists/' + pl.id, { name: n });
                    pl.name = n;
                    this.loadPlaylists();
                    this.selectPl(pl);
                }
            });
        }
        const deleteBtn = sl.querySelector('#pl-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm('确认删除歌单「' + pl.name + '」？')) {
                    await window.toolbox.api('DELETE', '/api/music/playlists/' + pl.id);
                    this.currentPlaylist = null;
                    this.loadPlaylists();
                    document.getElementById('pl-songs').innerHTML = '<div class="empty-state">选择一个歌单</div>';
                }
            });
        }
    },

    async delFromPl(plId, sid) {
        await window.toolbox.api('DELETE', '/api/music/playlists/' + plId + '/songs/' + encodeURIComponent(sid));
        // 强制刷新歌单列表和当前歌单视图
        this.loadPlaylists();
        const d = await window.toolbox.api('GET', '/api/music/playlists');
        const pl = d.playlists?.find(p => p.id === plId);
        if (pl) {
            console.log('[Music] Deleted from playlist:', pl.name, 'remaining:', pl.songs?.length);
            this.selectPl(pl);
        }
    },

    // ===== Add to Playlist Modal =====
    showAddModal(song) {
        const modal = document.getElementById('modal');
        document.getElementById('mt').textContent = '添加到歌单';
        document.getElementById('mb').innerHTML = '<div class="loading" style="padding:16px">加载歌单...</div>';
        modal.classList.remove('hidden');
        
        // Reset close button (cloneNode removes old listeners)
        const mc = document.getElementById('mc');
        const mcNew = mc.cloneNode(true);
        mc.parentNode.replaceChild(mcNew, mc);
        mcNew.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', function(ev) { if (ev.target === modal) modal.classList.add('hidden'); }, {once:true});
        
        // Fetch playlists and render
        window.toolbox.api('GET', '/api/music/playlists').then(r => {
            const pls = r.playlists || [];
            let h = '<div style="margin-bottom:8px;font-size:12px;color:var(--text2)">' + this.esc(song.title) + ' - ' + this.esc(song.artist||'') + '</div><div class="playlist-picker">';
            if (pls.length === 0) {
                h += '<div style="padding:8px;font-size:11px;color:var(--text3)">暂无歌单</div>';
            } else {
                pls.forEach(pl => {
                    const has = pl.songs && pl.songs.some(s => s.id === song.id);
                    h += '<div class="playlist-picker-item' + (has?' selected':'') + '" data-plid="' + pl.id + '"><span class="pl-check">' + (has?'✓ ':'') + '</span><span>' + this.esc(pl.name) + '</span><span style="font-size:10px;color:var(--text3);margin-left:auto">' + (pl.songs?.length||0) + '首</span></div>';
                });
            }
            h += '</div><div class="playlist-picker-new">+ 新建歌单</div>';
            document.getElementById('mb').innerHTML = h;
            
            document.getElementById('mb').addEventListener('click', async (ev) => {
                const item = ev.target.closest('.playlist-picker-item');
                if (item) {
                    // 解决：添加完成后关闭弹窗，不递归调用自身避免事件叠加
                    await this.addToPl(item.dataset.plid, song);
                    this.loadPlaylists();
                    document.getElementById('modal').classList.add('hidden');
                    return;
                }
                const newBtn = ev.target.closest('.playlist-picker-new');
                if (newBtn) {
                    const n = prompt('歌单名称：');
                    if (n) {
                        const rr = await window.toolbox.api('POST', '/api/music/playlists', {name:n});
                        if (rr.success) {
                            await this.addToPl(rr.playlist.id, song);
                            this.loadPlaylists();
                            document.getElementById('modal').classList.add('hidden');
                        }
                    }
                }
            }, {once: true});
        });
    },

    async addToPl(plId, song) {
        const songPayload = {
            id: song.id || '',
            title: song.title || '',
            artist: song.artist || '',
            source: song.source || '',
            sourceId: song.sourceId || (song.id && song.id.indexOf('_') > 0 ? song.id.substring(song.id.lastIndexOf('_') + 1) : ''),
            picId: song.picId || '',
            platform: song.platform || ''
        };
        console.log('[Music] Adding to playlist:', songPayload);
        await window.toolbox.api('POST', '/api/music/playlists/' + plId + '/songs', {song: songPayload});
        if (this.currentPlaylist === plId) {
            const d = await window.toolbox.api('GET', '/api/music/playlists');
            const pl = d.playlists?.find(p => p.id === plId);
            if (pl) {
                console.log('[Music] Reloaded playlist:', pl.name, pl.songs?.length, 'songs');
                this.selectPl(pl);
            }
        }
    },

    // ===== Local =====
    async loadLocal() {
        const r = await window.toolbox.api('GET', '/api/music/local');
        const sl = document.getElementById('local-list');
        if (!r.songs || r.songs.length === 0) { sl.innerHTML = '<div class="empty-state"><div style="font-size:32px;opacity:.5">💿</div><div style="margin-top:6px">暂无本地音乐</div></div>'; return; }
        let h = '<div style="font-size:11px;color:var(--text3);padding:4px 8px;margin-bottom:4px">本地音乐 ' + r.count + '首</div>';
        r.songs.forEach(s => {
            h += '<div class="song-item"><div class="song-info"><div class="song-title">' + this.esc(s.title) + '</div><div class="song-artist">' + s.file + '</div></div><div class="song-acts"><button class="btn-icon local-play" data-file="' + s.file + '" data-title="' + this.esc(s.title) + '">▶️</button></div></div>';
        });
        sl.innerHTML = h;
        sl.querySelectorAll('.local-play').forEach(b => {
            b.addEventListener('click', e => { e.stopPropagation(); this.play({id:'local_'+b.dataset.file.replace(/[^a-zA-Z0-9]/g,'_'),title:b.dataset.title,source:'local'}); });
        });
    }
};
// 聚创台 SPA 通过 window.musicManager 检测并调用 init；const 声明不会自动挂到 window，需显式暴露。
window.musicManager = musicManager;
