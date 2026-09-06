# -*- coding: utf-8 -*-
"""
聚创台 · PySide6 桌面宿主
=========================
左侧导航读取聚创台 apps.json，右侧 QWebEngineView 内嵌本地服务。
对离线端口/Web 服务，先调用聚创台后端 /api/launch 启动，再加载 URL。
对纯桌面 exe 应用，调用 /api/launch 启动独立窗口并在状态栏提示。
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QListWidget, QListWidgetItem, QPushButton, QLabel, QLineEdit,
    QSplitter, QStatusBar, QMessageBox
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import Qt, QUrl, QTimer, QThread, Signal, Slot

ROOT = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(ROOT)
APPS_PATH = os.path.join(PARENT, 'data', 'apps.json')
API_BASE = 'http://127.0.0.1:8768'


def api_request(path, method='GET', data=None, timeout=10):
    url = API_BASE + path
    headers = {'Content-Type': 'application/json'}
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'ok': False, 'reason': f'HTTP {e.code}'}
    except Exception as e:
        return {'ok': False, 'reason': str(e)}


class PollThread(QThread):
    ready = Signal()
    timeout = Signal()

    def __init__(self, url, max_ms=30000, interval=800):
        super().__init__()
        self.url = url
        self.max_ms = max_ms
        self.interval = interval
        self._running = True

    def run(self):
        started = time.time()
        # 给 exe 最小启动时间
        time.sleep(1.2)
        while self._running and (time.time() - started) * 1000 < self.max_ms:
            try:
                req = urllib.request.Request(self.url, method='HEAD')
                urllib.request.urlopen(req, timeout=2)
                self.ready.emit()
                return
            except Exception:
                pass
            time.sleep(self.interval / 1000)
        self.timeout.emit()

    def stop(self):
        self._running = False


class EmbedWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('聚创台 · Qt 桌面宿主')
        self.setMinimumSize(1100, 720)
        self.resize(1400, 900)

        self.apps = []
        self.current_url = None
        self.poll_thread = None

        self._build_ui()
        self._load_apps()

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        layout = QHBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        splitter = QSplitter(Qt.Horizontal)
        layout.addWidget(splitter)

        # ---------- 左侧导航 ----------
        left = QWidget()
        left.setMinimumWidth(220)
        left.setMaximumWidth(320)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(10, 10, 10, 10)
        left_layout.setSpacing(8)

        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText('搜索应用 / 服务...')
        self.search_edit.textChanged.connect(self._filter_apps)
        left_layout.addWidget(self.search_edit)

        self.list_widget = QListWidget()
        self.list_widget.itemClicked.connect(self._on_app_selected)
        left_layout.addWidget(self.list_widget)

        # 状态提示
        self.status_label = QLabel('就绪')
        self.status_label.setWordWrap(True)
        left_layout.addWidget(self.status_label)

        splitter.addWidget(left)

        # ---------- 右侧内容区 ----------
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        # 顶部工具栏
        toolbar = QHBoxLayout()
        toolbar.setContentsMargins(10, 8, 10, 8)
        toolbar.setSpacing(10)

        self.back_btn = QPushButton('返回列表')
        self.back_btn.setEnabled(False)
        self.back_btn.clicked.connect(self._go_back)
        toolbar.addWidget(self.back_btn)

        self.title_label = QLabel('内嵌预览')
        self.title_label.setStyleSheet('font-weight:600; font-size:14px;')
        toolbar.addWidget(self.title_label)

        toolbar.addStretch()

        self.url_label = QLabel('')
        self.url_label.setStyleSheet('color:#666;')
        toolbar.addWidget(self.url_label)

        self.refresh_btn = QPushButton('刷新')
        self.refresh_btn.setEnabled(False)
        self.refresh_btn.clicked.connect(self._refresh_page)
        toolbar.addWidget(self.refresh_btn)

        self.external_btn = QPushButton('外部打开')
        self.external_btn.setEnabled(False)
        self.external_btn.clicked.connect(self._open_external)
        toolbar.addWidget(self.external_btn)

        right_layout.addLayout(toolbar)

        # Web 视图
        self.web_view = QWebEngineView()
        right_layout.addWidget(self.web_view)

        splitter.addWidget(right)
        splitter.setSizes([260, 1140])

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage('等待启动聚创台后端 :8768')

    def _load_apps(self):
        try:
            with open(APPS_PATH, 'r', encoding='utf-8') as f:
                self.apps = json.load(f)
        except Exception as e:
            self.status_bar.showMessage(f'读取 apps.json 失败: {e}')
            return

        # 顺带检查后端是否在线
        health = api_request('/api/health', timeout=3)
        if health.get('ok'):
            self.status_bar.showMessage(f'已连接聚创台后端 :8768，共 {len(self.apps)} 个应用')
        else:
            self.status_bar.showMessage(f'后端 :8768 未响应：{health.get("reason")}，请先启动 start.bat')

        self._render_list()

    def _render_list(self):
        self.list_widget.clear()
        query = self.search_edit.text().lower()
        for app in self.apps:
            name = app.get('name', '未命名')
            kind = app.get('kind', 'app')
            if query and query not in name.lower():
                continue
            item = QListWidgetItem(f'{name}  ({kind})')
            item.setData(Qt.UserRole, app)
            self.list_widget.addItem(item)

    def _filter_apps(self):
        self._render_list()

    def _on_app_selected(self, item):
        app = item.data(Qt.UserRole)
        self._open_app(app)

    def _open_app(self, app):
        name = app.get('name', '未命名')
        kind = app.get('kind', 'app')
        url = app.get('url', '')
        port = app.get('port', 0)
        app_id = app.get('id', '')

        self.title_label.setText(name)
        self.status_label.setText(f'正在打开 {name}...')

        # 有本地 URL 的服务：web / web-service / port
        if url:
            # 先探测是否在线
            self.status_bar.showMessage(f'探测 {name} 是否在线...')
            probe = api_request('/api/launch', 'POST', {'id': app_id}, timeout=5)

            if not probe.get('ok'):
                # 未配置启动命令或启动失败
                self.status_bar.showMessage(f'{name} 离线且无法自动启动：{probe.get("reason", "")}')
                self.status_label.setText(f'离线：{probe.get("reason", "未知")}')
                return

            mode = probe.get('mode')
            target_url = probe.get('url') or url

            if mode == 'embed':
                self._load_url(target_url, name)
            elif mode == 'start':
                self.status_bar.showMessage(f'正在启动 {name} 服务，请稍候...')
                self.status_label.setText(f'服务启动中：{target_url}')
                self._poll_and_load(target_url, name)
            else:
                # app / run / folder 等无 URL 模式
                self.status_bar.showMessage(f'{name} 已启动独立窗口')
                self.status_label.setText('已在独立窗口启动')
        else:
            # 纯桌面 exe
            self.status_bar.showMessage(f'正在启动 {name}...')
            res = api_request('/api/launch', 'POST', {'id': app_id}, timeout=5)
            if res.get('ok'):
                self.status_bar.showMessage(f'{name} 已启动独立窗口')
                self.status_label.setText('已在独立窗口启动')
            else:
                self.status_bar.showMessage(f'{name} 启动失败：{res.get("reason", "")}')
                self.status_label.setText(f'启动失败：{res.get("reason", "")}')

    def _poll_and_load(self, url, name):
        if self.poll_thread and self.poll_thread.isRunning():
            self.poll_thread.stop()
            self.poll_thread.wait()

        self.poll_thread = PollThread(url)
        self.poll_thread.ready.connect(lambda: self._on_service_ready(url, name))
        self.poll_thread.timeout.connect(lambda: self._on_service_timeout(url, name))
        self.poll_thread.start()

    def _on_service_ready(self, url, name):
        self.status_bar.showMessage(f'{name} 服务已就绪')
        self._load_url(url, name)

    def _on_service_timeout(self, url, name):
        self.status_bar.showMessage(f'{name} 启动较慢，已尝试打开')
        self._load_url(url, name)
        self.status_label.setText('服务启动超时，若仍拒绝连接请稍候刷新')

    def _load_url(self, url, name):
        self.current_url = url
        self.url_label.setText(url)
        self.web_view.setUrl(QUrl(url))
        self.back_btn.setEnabled(True)
        self.refresh_btn.setEnabled(True)
        self.external_btn.setEnabled(True)
        self.status_label.setText(f'已加载 {name}')
        self.status_bar.showMessage(f'已加载 {name}')

    def _go_back(self):
        self.web_view.setUrl(QUrl('about:blank'))
        self.current_url = None
        self.url_label.setText('')
        self.title_label.setText('内嵌预览')
        self.back_btn.setEnabled(False)
        self.refresh_btn.setEnabled(False)
        self.external_btn.setEnabled(False)
        self.status_label.setText('返回列表')

    def _refresh_page(self):
        if self.current_url:
            self.web_view.reload()

    def _open_external(self):
        if self.current_url:
            os.startfile(self.current_url)

    def closeEvent(self, event):
        if self.poll_thread and self.poll_thread.isRunning():
            self.poll_thread.stop()
            self.poll_thread.wait(1000)
        event.accept()


def main():
    # 高 DPI 适配
    os.environ['QT_ENABLE_HIGHDPI_SCALING'] = '1'
    QApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)

    app = QApplication(sys.argv)
    app.setApplicationName('聚创台Qt')
    app.setApplicationDisplayName('聚创台 · Qt 桌面宿主')

    win = EmbedWindow()
    win.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
