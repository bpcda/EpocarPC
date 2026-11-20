#!/usr/bin/env python3
"""Download already-issued QR cards as private Pass2U sheets. Requires qrcode[pil]==8.2."""
import argparse
import base64
import html
import json
import os
from pathlib import Path
import re
import textwrap
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import zipfile

SITE = "https://epocarpc.com"
API = "https://cgbaunizlqqhctiiogok.supabase.co/rest/v1/"


def token_for(member_id, key):
    """Legacy v1 compatibility vector; current exports always reuse database credentials."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    member_id = str(uuid.UUID(member_id))
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Chiave di firma non valida")
    signature = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(key)).sign(f"epocar-card-v1:{member_id}".encode())
    return f"v1.{member_id}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def read_all(table, params, service_key):
    rows = []
    while True:
        query = urlencode({**params, "limit": 500, "offset": len(rows)})
        request = Request(API + table + "?" + query, headers={"apikey": service_key, "Authorization": "Bearer " + service_key})
        with urlopen(request, timeout=20) as response:
            batch = json.load(response)
        if not isinstance(batch, list):
            raise ValueError("Risposta del registro non valida")
        rows.extend(batch)
        if len(batch) < 500:
            return rows


def export(args):
    import qrcode
    import qrcode.image.svg
    from PIL import Image, ImageDraw, ImageFont

    output = args.output.expanduser().resolve()
    repo = Path(__file__).resolve().parents[1]
    if output == repo or repo in output.parents:
        raise ValueError("Esporta i codici fuori dal repository e dalle cartelle pubbliche")
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    output.chmod(0o700)
    service_key = args.service_key_file.expanduser().read_text().strip()
    members = read_all("member_card_credentials", {
        "select": "treasury_member_id,qr_token,full_name,card_number,category",
        "order": "card_number.asc",
    }, service_key)
    if not members:
        raise ValueError("Nessuna tessera emessa disponibile")
    member_ids, card_numbers = set(), set()
    for member in members:
        member_id = str(uuid.UUID(member["treasury_member_id"]))
        card = member["card_number"]
        if member_id in member_ids or type(card) is not int or card <= 0 or card in card_numbers:
            raise ValueError("Identificativo o numero tessera mancante o duplicato")
        if not re.fullmatch(r"v2\.[0-9a-f]{64}|v1\." + re.escape(member_id) + r"\.[A-Za-z0-9_-]{86}", member["qr_token"]):
            raise ValueError("Codice tessera non valido")
        member_ids.add(member_id)
        card_numbers.add(card)
    cards, articles, pages = [], [], []
    font = ImageFont.truetype("DejaVuSans.ttf", 32)
    for member in members:
        card = member["card_number"]
        name = member["full_name"]
        url = SITE + "/verifica-tessera#" + member["qr_token"]
        stem = f"tessera-{card:04d}"
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
        qr.add_data(url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        image.save(output / (stem + ".png"))
        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(output / (stem + ".svg"))
        cards.append({"card_number": card, "full_name": name, "category": member["category"], "url": url, "png": stem + ".png", "svg": stem + ".svg"})
        articles.append(f'<article><h2>{html.escape(name)}</h2><p>Tessera n. {card} · {html.escape(member["category"])}</p><img src="{stem}.png" alt="QR personale tessera {card}"><p><a href="{html.escape(url, quote=True)}">Verifica questa tessera</a></p></article>')
        page = Image.new("RGB", (1240, 1754), "white")
        draw = ImageDraw.Draw(page)
        draw.text((620, 160), "EPOCAR · CODICE PER PASS2U", fill="black", font=font, anchor="mm")
        for line, text in enumerate(textwrap.wrap(name, 48)):
            draw.text((620, 270 + line * 42), text, fill="black", font=font, anchor="mm")
        draw.text((620, 420), f'Tessera n. {card} · {member["category"]}', fill="black", font=font, anchor="mm")
        page.paste(image, ((1240 - image.width) // 2, 560))
        draw.text((620, 1430), "Scansiona questo codice con Pass2U Wallet", fill="black", font=font, anchor="mm")
        pages.append(page)
    document = '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>Epocar · Codici per Pass2U</title><style>body{font:18px system-ui;max-width:850px;margin:40px auto;padding:24px}article{border-top:1px solid #aaa;padding:30px 0;break-after:page}img{width:min(100%,600px);height:auto}h2{font-size:28px}</style><h1>Codici personali per Pass2U</h1><p>Documento riservato: aprilo sul PC e scansiona il QR del socio con Pass2U. Controlla nome, numero e categoria prima di distribuire la tessera. Non pubblicare questo indice, il PDF o lo ZIP.</p>' + "".join(articles) + "</html>"
    (output / "indice.html").write_text(document)
    (output / "elenco.json").write_text(json.dumps(cards, ensure_ascii=False, indent=2))
    pages[0].save(output / "codici-pass2u.pdf", save_all=True, append_images=pages[1:], resolution=150)
    (output / "LEGGIMI.txt").write_text("Apri indice.html oppure codici-pass2u.pdf sul PC. In Pass2U acquisisci il QR e conserva il contenuto esatto, compresa la parte dopo #. Personalizza la tessera e pubblica soltanto il file/link individuale generato da Pass2U. Non pubblicare questo pacchetto con i QR di tutti i soci.\n\nLe nuove tessere vengono emesse automaticamente dopo la conferma di ammissione e quota dalla Tesoreria. Le ritrovi in https://epocarpc.com/gestione-tessere accedendo esclusivamente con il tuo account. Questa esportazione riutilizza quei codici senza generarne altri, anche dopo un rinnovo.\n\nIl QR apre una verifica online: non cambia automaticamente testo o colore della tessera Pass2U e non registra tappe. Un QR statico può essere copiato: confronta il numero sul risultato con la tessera del titolare. La verifica usa gli ultimi dati ricevuti dalla Tesoreria e ne mostra la data. Il registro associativo resta gestito dalla Tesoreria.\n")
    with zipfile.ZipFile(output / "tessere-pass2u.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for path in [output / "indice.html", output / "elenco.json", output / "codici-pass2u.pdf", output / "LEGGIMI.txt"] + [output / card[k] for card in cards for k in ["png", "svg"]]:
            archive.write(path, path.name)
    return len(cards)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path.home() / ".local/share/epocar/tessere-pass2u")
    parser.add_argument("--service-key-file", type=Path, default=Path.home() / ".config/epocar/supabase-service-role")
    args = parser.parse_args()
    try:
        count = export(args)
        print(f"Esportate {count} tessere in {args.output.expanduser()}. Il pacchetto è riservato.")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Esportazione interrotta: {error}\n")
