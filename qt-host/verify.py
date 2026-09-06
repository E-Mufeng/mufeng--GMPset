# -*- coding: utf-8 -*-
"""
最小验证脚本：检查 PySide6 + QWebEngineView 能正常实例化，
并尝试连接聚创台后端 :8768。
"""
import sys
import os

os.environ['QT_ENABLE_HIGHDPI_SCALING'] = '1'

from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import QUrl, Qt
import urllib.request
import json

def check_backend():
    try:
        req = urllib.request.Request('http://127.0.0.1:8768/api/health')
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('ok', False)
    except Exception as e:
        print(f'backend check failed: {e}')
        return False


def main():
    print('Step 1: backend health check...')
    if not check_backend():
        print('FAIL: 聚创台后端 :8768 未启动，请先运行 D:\\聚创台\\start.bat')
        return 1
    print('PASS: backend :8768 is alive')

    print('Step 2: QApplication + QWebEngineView instantiate...')
    QApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    app = QApplication(sys.argv)

    view = QWebEngineView()
    view.setUrl(QUrl('http://127.0.0.1:8768/'))
    view.resize(1280, 800)
    view.show()

    print('PASS: QWebEngineView created and navigated to http://127.0.0.1:8768/')
    print('You should see the 聚创台 window. Close it to exit verify.')

    return app.exec()


if __name__ == '__main__':
    sys.exit(main())
