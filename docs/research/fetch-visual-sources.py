"""VU-03: Docker 안에서 고정 CC0 원본을 내려받아 해시를 확인한다."""
from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import ZipFile
from io import BytesIO
from hashlib import sha256

sources = {
    "Fabric037": "b1acfa7c9b2ff2c0d0e8ff89b82cf86c4894777fbc20a2e3201664a4917469a3",
    "Wood050": "a16cab3c789dd34570759b5bfb7ced36f983c180a20e3796d3dcb5571d94053d",
}
out = Path(".visual-source")
out.mkdir(exist_ok=True)
for asset, expected in sources.items():
    request = Request(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip", headers={"User-Agent": "p2p-gostop-visual-research"})
    with urlopen(request, timeout=90) as response:
        archive = ZipFile(BytesIO(response.read()))
    name = f"{asset}_1K-JPG_Color.jpg"
    data = archive.read(name)
    if sha256(data).hexdigest() != expected:
        raise ValueError(f"원본 해시 변경: {asset}. 라이선스·원본 재검토 필요")
    (out / name).write_bytes(data)
    print(name, len(data), expected)
