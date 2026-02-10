# Higgsfield 이미지 생성 (브랜드 커넥트용)

> 쿠썬(인플루언서) + 제품 콜라보 이미지 자동 생성

⚠️ **원본 절대 수정 금지!**
- 원본 경로: `C:\test\higgs_automation_v1`
- 이 폴더는 원본을 import해서 사용하는 래퍼 스크립트

---

## 📁 파일 구조

```
higgs/
├── README.md                    # 이 파일
├── product_image_generator.py   # 메인 이미지 생성 스크립트
└── remove_bg.py                 # 배경 제거 (누끼) 유틸리티
```

---

## 🚀 사용법

### 1. 배경 제거 (누끼 따기)

```bash
# 로컬 rembg 사용 (무료)
python higgs/remove_bg.py product.jpg

# remove.bg API 사용 (유료, 더 정확)
python higgs/remove_bg.py product.jpg --api
```

### 2. 제품 이미지 생성

```bash
# 기본 (holding 장면)
python higgs/product_image_generator.py product_nobg.png

# 특정 장면 지정
python higgs/product_image_generator.py product_nobg.png --scene unboxing

# 출력 폴더 지정
python higgs/product_image_generator.py product_nobg.png --output ./output
```

### 3. Python에서 사용

```python
from higgs.product_image_generator import generate_product_image, generate_multiple_scenes
from higgs.remove_bg import remove_background

# 1. 누끼 따기
product_nobg = remove_background("product.jpg")

# 2. 단일 이미지 생성
result = generate_product_image(
    product_image_path=product_nobg,
    scene_type="holding",  # unboxing, holding, using, selfie, desk, review, daily
)

# 3. 여러 장면 생성
results = generate_multiple_scenes(
    product_image_path=product_nobg,
    scene_types=["holding", "unboxing", "using"],
)
```

---

## 🎬 장면 템플릿

| scene_type | 설명 | 프롬프트 요약 |
|------------|------|--------------|
| `unboxing` | 택배 개봉 장면 | 박스 열며 설레는 표정 |
| `holding` | 제품 들고 있는 모습 | 카메라 보며 미소 |
| `using` | 제품 사용 중 | 집중한 표정 |
| `selfie` | 제품과 셀카 | 거울샷 |
| `desk` | 책상 위 제품과 함께 | 재택근무 느낌 |
| `review` | 리뷰 촬영 느낌 | 제품 설명하는 모습 |
| `daily` | 일상 속 제품 | 자연스러운 일상 컷 |

---

## ⚙️ 설정

### 필요 패키지

```bash
# rembg (배경 제거)
pip install rembg

# Playwright (Higgsfield 자동화)
pip install playwright
playwright install chromium
```

### 환경변수 (선택)

```env
# remove.bg API 사용 시
REMOVE_BG_API_KEY=your_api_key
```

---

## 🔗 레퍼런스 이미지

- **쿠썬 얼굴**: `../persona/influencer-face.jpg`
- 자동으로 ref1에 매핑됨

---

## 📝 통합 플로우 (향후 구현)

```
1. 상품 페이지에서 제품 이미지 다운로드
2. 배경 제거 (누끼)
3. Higgsfield로 쿠썬+제품 이미지 생성
4. Opus로 자연스러운 글 생성
5. 이미지 + 글 조합해서 블로그 발행
```
