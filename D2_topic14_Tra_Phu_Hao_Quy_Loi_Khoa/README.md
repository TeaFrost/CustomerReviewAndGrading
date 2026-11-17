# Google Colab Execution Guide with Kaggle API Integration

This guide provides step-by-step instructions on how to set up your Kaggle API token and run the Jupyter Notebook in Google Colab.

---

## Prerequisites

Before running the notebook, make sure you have:
1. A **Google Account** (to access Google Colab).
2. A **Kaggle Account** (to download dataset credentials).

---

## Step 1: Obtain Your Kaggle API Token

1. Go to [Kaggle](https://www.kaggle.com/) and log in to your account.
2. Click on your profile icon located at the **top-right corner** of the screen.
3. Select **Your API tokens** (or **Settings**) from the drop-down menu.
4. Scroll down to the **Legacy API Credentials** section.
5. Click **Create Legacy API Key**.
6. A file named `kaggle.json` will automatically download to your computer. **Keep this file saved on your local storage.**

---

## Step 2: Set Up and Run the Google Colab Notebook

1. Open the `.ipynb` notebook file in [Google Colab](https://colab.research.google.com/).
2. Connect to a runtime by clicking the **Connect** button in the top-right corner.
3. You can choose to run the notebook in two ways:
   * **Option A (Sequential):** Click the **Play** icon on each code cell to execute them one by one.
   * **Option B (Automated):** Select **Runtime** > **Run all** from the top navigation bar.

---

## Step 3: Upload the Kaggle Credentials

1. When the notebook reaches the file upload code block:
   ```python
   from google.colab import files
   files.upload()
   ```
2. Click the **Choose Files** button that appears below the cell.
3. Select the `kaggle.json` file you downloaded in Step 1.
4. Once the upload finishes, the script will automatically authenticate with Kaggle and download the required datasets to run the analysis.

---

## Troubleshooting & Notes
* If you restart the Google Colab runtime session, you may need to re-upload the `kaggle.json` file.
* Make sure not to share your `kaggle.json` file publicly, as it contains your API authentication key.