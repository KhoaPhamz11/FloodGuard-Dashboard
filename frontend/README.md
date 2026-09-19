Frontend is served by the FastAPI backend.

Run from the project root:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.server:app --reload --port 8000
```

Open http://127.0.0.1:8000/ in the browser.