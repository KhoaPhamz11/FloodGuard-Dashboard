=================Run dashboard command=====================

From the project root:

```powershell
.\backend\venv\Scripts\Activate.ps1
uvicorn backend.app.server:app --reload --port 8000
```

Forecast uses the hourly model. The departure-time picker is limited to
whole hours, and hourly water-level features use the latest observation at or
before each hour boundary to avoid using data from the future.