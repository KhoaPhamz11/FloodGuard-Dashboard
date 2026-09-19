=================Run dashboard command=====================

From the project root:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.server:app --reload --port 8000
```