from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import httpx
from pydantic import BaseModel

app = FastAPI()

# 1. API 라우트들을 먼저 정의합니다.
@app.get("/api/health")
def health_check():
    return {"status": "ok"}

class QueryRequest(BaseModel):
    query: str

@app.post("/api/generate")
async def proxy_generate(request: QueryRequest):
    async with httpx.AsyncClient() as client:
        try:
            # Forward the request to the query service running on port 8001
            response = await client.post(
                "http://127.0.0.1:8000/generate",
                json={"query": request.query},
                timeout=60.0  # Increased timeout for deep research
            )
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=f"Error communicating with query service: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"Query service error: {exc.response.text}")

# ... 여기에 기존 백엔드 로직 추가 ...

# 2. Next.js 빌드 결과물('out' 폴더)이 있는지 확인
# 주의: 실제 실행 전 'npm run build'를 통해 out 폴더가 생성되어 있어야 합니다.
build_dir = os.path.join(os.getcwd(), "out")

if os.path.exists(build_dir):
    # 3. 정적 파일 마운트 (_next 폴더 등)
    # Next.js의 정적 자산들은 주로 _next 경로 아래에 있습니다.
    app.mount("/_next", StaticFiles(directory=os.path.join(build_dir, "_next")), name="next")
    
    # 4. 루트 경로 및 기타 정적 파일 서빙
    # SPA(Single Page Application)처럼 동작하게 하려면 404 발생 시 index.html을 반환하거나
    # 특정 경로에 맞는 html을 반환해야 합니다.
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # 요청된 파일이 실제로 존재하면 그 파일을 반환 (예: favicon.ico, robots.txt)
        file_path = os.path.join(build_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # Try appending .html
        html_path = os.path.join(build_dir, full_path + ".html")
        if os.path.exists(html_path) and os.path.isfile(html_path):
            return FileResponse(html_path)
            
        if full_path == "" or full_path == "/":
             index_path = os.path.join(build_dir, "index.html")
             if os.path.exists(index_path):
                return FileResponse(index_path)

        # 존재하지 않는 경로라면 index.html 반환 (Client-side Routing 지원)
        # 혹은 특정 페이지(analysis.html 등)로 매핑 로직 추가 가능
        index_path = os.path.join(build_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
            
        return HTTPException(status_code=404, detail="File not found and index.html not available")

else:
    print("Warning: 'out' directory not found. Run 'npm run build' first.")

if __name__ == "__main__":
    import uvicorn
    print("Server running at: http://localhost:8001")
    uvicorn.run(app, host="127.0.0.1", port=8001)
