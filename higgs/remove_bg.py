# -*- coding: utf-8 -*-
"""
제품 이미지 배경 제거 (누끼 따기)
- rembg 라이브러리 사용 (로컬, 무료)
- 또는 remove.bg API 사용 (유료, 더 정확)
"""

import os
from pathlib import Path


def remove_background_local(input_path: str, output_path: str = None) -> str:
    """
    rembg 라이브러리로 배경 제거 (로컬, 무료)
    
    설치: pip install rembg[gpu] 또는 pip install rembg
    """
    try:
        from rembg import remove
        from PIL import Image
    except ImportError:
        print("❌ rembg 라이브러리가 필요합니다: pip install rembg")
        return None
    
    if not output_path:
        input_file = Path(input_path)
        output_path = str(input_file.parent / f"{input_file.stem}_nobg.png")
    
    print(f"🔄 배경 제거 중: {input_path}")
    
    with open(input_path, "rb") as f:
        input_data = f.read()
    
    output_data = remove(input_data)
    
    with open(output_path, "wb") as f:
        f.write(output_data)
    
    print(f"✅ 배경 제거 완료: {output_path}")
    return output_path


def remove_background_api(input_path: str, output_path: str = None, api_key: str = None) -> str:
    """
    remove.bg API로 배경 제거 (유료, 더 정확)
    
    API 키: https://www.remove.bg/api
    """
    import requests
    
    if not api_key:
        api_key = os.environ.get("REMOVE_BG_API_KEY")
        if not api_key:
            print("❌ REMOVE_BG_API_KEY 환경변수 또는 api_key 파라미터 필요")
            return None
    
    if not output_path:
        input_file = Path(input_path)
        output_path = str(input_file.parent / f"{input_file.stem}_nobg.png")
    
    print(f"🔄 배경 제거 중 (API): {input_path}")
    
    with open(input_path, "rb") as f:
        response = requests.post(
            "https://api.remove.bg/v1.0/removebg",
            files={"image_file": f},
            data={"size": "auto"},
            headers={"X-Api-Key": api_key},
        )
    
    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"✅ 배경 제거 완료: {output_path}")
        return output_path
    else:
        print(f"❌ API 오류: {response.status_code} - {response.text}")
        return None


def remove_background(input_path: str, output_path: str = None, use_api: bool = False) -> str:
    """
    배경 제거 (자동 선택)
    
    Args:
        input_path: 입력 이미지 경로
        output_path: 출력 이미지 경로 (None이면 자동)
        use_api: True면 remove.bg API 사용, False면 로컬 rembg 사용
    """
    if use_api:
        return remove_background_api(input_path, output_path)
    else:
        return remove_background_local(input_path, output_path)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="제품 이미지 배경 제거")
    parser.add_argument("input", help="입력 이미지 경로")
    parser.add_argument("--output", help="출력 이미지 경로")
    parser.add_argument("--api", action="store_true", help="remove.bg API 사용")
    
    args = parser.parse_args()
    
    remove_background(args.input, args.output, args.api)
