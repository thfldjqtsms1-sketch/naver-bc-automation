# -*- coding: utf-8 -*-
"""
브랜드 커넥트용 Higgsfield 이미지 생성기
- 쿠썬(인플루언서) + 제품 콜라보 이미지 생성
- 원본: C:\test\higgs_automation_v1 (절대 수정 금지!)
"""

import sys
import os

# 원본 higgs_automation 경로 추가 (import용)
ORIGINAL_HIGGS_PATH = r"C:\test\higgs_automation_v1"
sys.path.insert(0, ORIGINAL_HIGGS_PATH)

from higgs_json_automation import HiggsJSONAutomation
import json
from datetime import datetime
from pathlib import Path


# 쿠썬 레퍼런스 이미지 (고정)
KUSUN_FACE_IMAGE = os.path.join(
    os.path.dirname(__file__), "..", "persona", "influencer-face.jpg"
)

# 장면 템플릿
SCENE_TEMPLATES = {
    "unboxing": {
        "prompt": "A Korean woman in her 30s opening a package box, looking excited, natural lighting, cozy home interior, casual outfit",
        "description": "택배 개봉 장면",
    },
    "holding": {
        "prompt": "A Korean woman in her 30s holding a product in her hand, smiling at camera, natural lighting, clean background, casual home setting",
        "description": "제품 들고 있는 모습",
    },
    "using": {
        "prompt": "A Korean woman in her 30s using a product, focused expression, natural lighting, cozy room, lifestyle photo",
        "description": "제품 사용 중",
    },
    "selfie": {
        "prompt": "A Korean woman in her 30s taking a mirror selfie with product, casual outfit, natural makeup, cozy bedroom",
        "description": "제품과 셀카",
    },
    "desk": {
        "prompt": "A Korean woman in her 30s sitting at desk with product placed in front, working from home, natural lighting, minimalist interior",
        "description": "책상 위 제품과 함께",
    },
    "review": {
        "prompt": "A Korean woman in her 30s showing product to camera, explaining features, natural expression, home studio setup",
        "description": "리뷰 촬영 느낌",
    },
    "daily": {
        "prompt": "A Korean woman in her 30s in daily life scene with product visible, natural candid moment, warm lighting, cozy apartment",
        "description": "일상 속 제품",
    },
}


def generate_product_image(
    product_image_path: str,
    scene_type: str = "holding",
    custom_prompt: str = None,
    output_folder: str = None,
    model_code: str = "nano_banana_2",  # 또는 "nano_banana_pro"
    aspect_ratio: str = "1:1",  # 기본 1:1 (정사각형)
    resolution: str = "2K",
    unlimited_mode: bool = True,
) -> str:
    """
    쿠썬 + 제품 콜라보 이미지 생성
    
    Args:
        product_image_path: 제품 이미지 경로 (누끼 권장)
        scene_type: 장면 유형 (unboxing, holding, using, selfie, desk, review, daily)
        custom_prompt: 커스텀 프롬프트 (scene_type 대신 사용)
        output_folder: 출력 폴더 (None이면 자동 생성)
        model_code: Higgsfield 모델 코드
        aspect_ratio: 비율 (9:16, 4:3, 1:1 등)
        resolution: 해상도 (1K, 2K, 4K)
    
    Returns:
        생성된 이미지 경로
    """
    
    # 프롬프트 결정
    if custom_prompt:
        prompt = custom_prompt
    elif scene_type in SCENE_TEMPLATES:
        prompt = SCENE_TEMPLATES[scene_type]["prompt"]
    else:
        raise ValueError(f"Unknown scene_type: {scene_type}. Available: {list(SCENE_TEMPLATES.keys())}")
    
    # 출력 폴더 설정
    if not output_folder:
        timestamp = datetime.now().strftime("%y%m%d_%H%M%S")
        output_folder = f"higgs_output_{timestamp}"
    
    os.makedirs(output_folder, exist_ok=True)
    
    # JSON 파일 생성 (Higgsfield 입력 형식)
    json_data = {
        "story_title": "Product Review Image",
        "characterRefs": [
            {
                "id": "kusun",
                "name": "쿠썬",
                "description": "30대 한국 여성 인플루언서"
            }
        ],
        "scenes": [
            {
                "ref": "product_scene",
                "prompt": prompt,
                "requiredRefs": ["ref1", "ref2"]
            }
        ]
    }
    
    json_path = os.path.join(output_folder, "scene_config.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    
    # 레퍼런스 이미지 매핑
    ref_images = {
        "ref1": os.path.abspath(KUSUN_FACE_IMAGE),  # 쿠썬 얼굴
        "ref2": os.path.abspath(product_image_path),  # 제품 이미지
    }
    
    print(f"🎨 이미지 생성 시작")
    print(f"   - 쿠썬 이미지: {ref_images['ref1']}")
    print(f"   - 제품 이미지: {ref_images['ref2']}")
    print(f"   - 장면: {scene_type}")
    print(f"   - 프롬프트: {prompt[:50]}...")
    
    # Higgsfield 자동화 실행
    automation = HiggsJSONAutomation(
        json_path=json_path,
        ref_images_mapping=ref_images,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        download_folder=output_folder,
        model_code=model_code,
        unlimited_mode=True,
    )
    
    try:
        automation.load_json()
        automation.run()
        
        # 생성된 이미지 찾기
        generated_images = list(Path(output_folder).glob("*.png")) + list(Path(output_folder).glob("*.jpg"))
        if generated_images:
            result_path = str(generated_images[0])
            print(f"✅ 이미지 생성 완료: {result_path}")
            return result_path
        else:
            print("❌ 생성된 이미지를 찾을 수 없습니다")
            return None
            
    except Exception as e:
        print(f"❌ 이미지 생성 실패: {e}")
        return None


def generate_multiple_scenes(
    product_image_path: str,
    scene_types: list = None,
    output_folder: str = None,
    model_code: str = "nano_banana_2",
) -> list:
    """
    여러 장면의 이미지 생성
    
    Args:
        product_image_path: 제품 이미지 경로
        scene_types: 장면 유형 리스트 (None이면 기본 3개)
        output_folder: 출력 폴더
    
    Returns:
        생성된 이미지 경로 리스트
    """
    
    if scene_types is None:
        scene_types = ["holding", "unboxing", "using"]
    
    if not output_folder:
        timestamp = datetime.now().strftime("%y%m%d_%H%M%S")
        output_folder = f"higgs_multi_{timestamp}"
    
    os.makedirs(output_folder, exist_ok=True)
    
    results = []
    for i, scene_type in enumerate(scene_types):
        print(f"\n[{i+1}/{len(scene_types)}] {scene_type} 장면 생성 중...")
        scene_folder = os.path.join(output_folder, scene_type)
        
        result = generate_product_image(
            product_image_path=product_image_path,
            scene_type=scene_type,
            output_folder=scene_folder,
            model_code=model_code,
        )
        
        if result:
            results.append(result)
    
    print(f"\n✅ 총 {len(results)}/{len(scene_types)} 이미지 생성 완료")
    return results


# CLI 사용
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="브랜드 커넥트용 제품 이미지 생성")
    parser.add_argument("product_image", help="제품 이미지 경로")
    parser.add_argument("--scene", default="holding", help="장면 유형")
    parser.add_argument("--output", help="출력 폴더")
    parser.add_argument("--model", default="nano_banana_2", help="Higgsfield 모델")
    
    args = parser.parse_args()
    
    generate_product_image(
        product_image_path=args.product_image,
        scene_type=args.scene,
        output_folder=args.output,
        model_code=args.model,
    )
