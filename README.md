# Amazon Customer Reviews Analysis: Books Category

**IT135IU - Introduction to Data Science · Project Deliverable 3 (D3): Analysis Notebook**
Instructor: Nguyen Thi Thuy Loan · Topic 14

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/TeaFrost/CustomerReviewAndGrading/blob/D3_Analyze/D3_Topic14_Tra_Hao_Phu_Loi_Quy_Khoa.ipynb)
link to github: https://github.com/TeaFrost/CustomerReviewAndGrading.git
---

## 1. Team

| # | Name | Student ID | Role |
|---|---|---|---|
| 1 | Nguyễn Đỗ Nam Trà | ITDSIU25049 | Product Owner (Leader) |
| 2 | Bùi Văn Lợi | ITDSIU25021 | Data Engineer |
| 3 | Nguyễn Thế Hào | ITDSIU22139 | Data Analyst |
| 4 | Phạm Ngọc Minh Khoa | ITDSIU25015 | Reproducibility Lead |
| 5 | Nguyễn Trọng Quý | ITDSIU25037 | Visualization Lead |
| 6 | Trần Như Phú | ITDSIU25027 | Ethics & Privacy Officer |

## 2. Decision Question

> Should Amazon product category managers invest in NLP sentiment extraction to identify product flaw patterns early, or rely solely on average star ratings?

This deliverable answers the question for the **Books** category only (47,179 reviews after the D2 cleaning step).

## 3. What the notebook contains

The notebook `D3_Topic14_Tra_Hao_Phu_Loi_Quy_Khoa.ipynb` follows this order:

| Section | Content |
|---|---|
| 1 | Objective, scope and hypotheses |
| 2 | Setup and data loading (fixed seed, library versions printed) |
| 3 | **Descriptive statistics**, Figures 1-2 (star ratings, review length) |
| 4 | **Statistical relationships**: Part 1 Welch's t-test (Figure 3), Part 2 Spearman correlation, Part 3 linear regression (Figure 4) |
| 5 | Qualitative check: 10 flagged reviews read in full |
| 6 | Interpretation |
| 7 | What this analysis does **not** establish |
| 8 | Conclusion and answer to the decision question |

## 4. Key results

| Analysis | Result | Reading |
|---|---|---|
| Welch's t-test (4-5 star reviews, negative word vs none) | 4.749 vs 4.826 stars, p < 0.001, Cohen's d = -0.20 | Significant but **small** difference |
| Spearman correlation (review length vs helpful votes) | rho = 0.267, p < 0.001 | **Weak** positive association |
| Linear regression on log-log scale | slope = 0.269, R² = 0.088 | Length explains under 9% of the variation |
| Manual check of 10 flagged reviews | 1 of 10 is a genuine complaint | The keyword flag is a **noisy** complaint detector |

**Answer in short.** Star ratings alone cannot show what 4-5 star reviews say in their text (13.8% contain a negative word). But our results do not prove that review text reveals product flaws. We recommend a small, validated NLP pilot rather than a full investment.

**Limitations.** Associations only, not causes. Statistical significance mainly reflects the large sample. D2 kept only verified purchases with at least 3 helpful votes. Results apply to Books only. See section 7 of the notebook for the full list.

## 5. Repository structure

```
CustomerReviewAndGrading/
├── D3_Topic14_Tra_Hao_Phu_Loi_Quy_Khoa.ipynb   # analysis notebook (run, with outputs)
├── README.md                                   # this file
├── requirements.txt                            # Python dependencies
├── .gitignore                                  # excludes the large CSV file
└── figures/                                    # (optional) exported charts, PNG
```

> The dataset is **not** stored in this repository because of its size. The notebook downloads it automatically (see section 6).

## 6. Data

| Item | Value |
|---|---|
| File | `2.1_amazon_reviews_webDisplay.csv` (output of Deliverable 2) |
| Source | Public Google Drive file (file ID `1Y_aYSFOty8bo7j-2yoeNTMTFPUM-dt4y`), downloaded automatically by the notebook with `gdown` |
| Scope used | Rows where `product_category == "Books"` (47,179 rows) |
| Filters applied in D2 | Verified purchases only; at least 3 helpful votes |
| Key columns | `star_rating`, `review_length`, `helpful_votes`, `high_rating_negative_flag`, `review_body` |

Reviews are public Amazon review texts. No personal identifiers are used in the analysis.

## 7. How to run

### Option A: Google Colab (recommended)
1. Click the **Open In Colab** badge at the top of this file.
2. Choose **Runtime → Run all**.
3. The dataset is downloaded automatically on the first run.

### Option B: Run locally
```bash
git clone https://github.com/TeaFrost/CustomerReviewAndGrading.git
cd CustomerReviewAndGrading
git checkout D3_Analyze

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

jupyter notebook D3_Topic14_Tra_Hao_Phu_Loi_Quy_Khoa.ipynb
```
Then choose **Kernel → Restart & Run All**.

## 8. Reproducibility

- Random seed fixed at `SEED = 42` (used for the 2,000-point scatter sample and the 10-review reading sample).
- Library versions are printed in the setup cell of the notebook.
- The notebook runs from top to bottom without manual steps.
- Only open-source tools are used: `pandas`, `numpy`, `scipy`, `matplotlib`.

## 9. Course context

This notebook is part of the group project for IT135IU (International University, VNU-HCM). It builds on Deliverable 2 (data cleaning and the negative-keyword flag).
