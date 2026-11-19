# 📚 Amazon Book Reviews - Interactive Dashboard & NLP Analytics

A full-stack web application designed for data science project presentations, enabling interactive exploration, customer review filtering, and natural language processing (NLP) sentiment mismatch analysis on Amazon book reviews.

## 🚀 Key Features

- **Master-Detail Dashboard:** Interactive UI allowing users to filter by specific book titles, NLP sentiment mismatch flags, and multi-criteria sorting options.
- **Dynamic SQL Queries:** Backend built with Python Flask & SQLite, utilizing dynamic request parameters for high-performance data retrieval.
- **Visual Analytics:** Real-time Chart.js integration displaying star rating distributions and NLP sentiment mismatch flags (`High Rating Negative` & `Low Rating Positive`).
- **Sticky Table Headers:** Smooth scrolling data table with fixed headers for better user experience.

## 📂 Project Structure

```text
CustomerReviewAndGrading/
├── backend/
│   └── app.py
├── database/
│   ├── amazon_reviews.db
│   └── setup_db.py
├── data/
│   └── 3.amazon_reviews_nlp_results.csv
├── frontend/
│   └── index.html
├── .gitignore
├── main.ipynb
├── requirements.txt
└── README.md
```

## 🛠️ Setup & Installation Guide

Follow these steps to set up and run the project locally on your machine.

### Prerequisites

Make sure you have **Python 3.10+** installed on your system (Ubuntu Linux / Windows / macOS).

### Step 1: Clone the Repository & Navigate to Project Folder

```bash
git clone https://github.com/TeaFrost/CustomerReviewAndGrading.git
cd CustomerReviewAndGrading
```

### Step 2: Create and Activate a Virtual Environment (Choose Option A or Option B)

You can use **Conda** (Recommended for Data Science workflows) or Python's native **venv** if you prefer a lightweight alternative.

#### Option A: Using Conda (Recommended)
```bash
conda create -n ds_project python=3.10 -y
conda activate ds_project
```

#### Option B: Using Python Native `venv` (Alternative)
If you don't use Conda, you can skip it and use Python's built-in virtual environment:
```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment:
# On Ubuntu/Linux/macOS:
source .venv/bin/activate

# On Windows (Command Prompt):
# .venv\Scripts\activate.bat

# On Windows (PowerShell):
# .venv\Scripts\Activate.ps1
```

### Step 3: Install Dependencies via `requirements.txt`

Install all required Python packages:

```bash
pip install -r requirements.txt
```

### Step 4: Download Datasets & Setup Database

1. Download the processed CSV datasets from Google Drive:
   - [`3.amazon_reviews_nlp_results.csv`](https://drive.google.com/file/d/1pYCbviAGtbAD7UD7M_sHiaP3_aJibIBT/view?usp=sharing)
2. Place this CSV files into the `data/` directory.
3. Run the database setup script:
   ```bash
   python database/setup_db.py
   ```

### Step 5: Run the Backend Flask Server

Start the backend API service:

```bash
python backend/app.py
```
*(The server will run at `http://127.0.0.1:5000`)*

### Step 6: Launch the Frontend Dashboard

Open `frontend/index.html` directly in your web browser (or use the VS Code **Live Server** extension).
