"""Authenticated viewers: PDF/image originals are never returned to the browser."""
from io import BytesIO
import math
from pathlib import Path
from threading import Lock
from urllib.parse import urlencode
from django.core import signing
from django.http import HttpResponse, JsonResponse
from django.utils.crypto import salted_hmac

PDF_LOCK = Lock()  # PDFium is not thread-safe; Django's local server is threaded.
TOKEN_SALT = 'edubox-media-reader-v1'
TOKEN_MAX_AGE = 12 * 60 * 60


def viewer_label(request):
    return f'EduBox | @{request.user.username} | Consulta educativa' if request.user.is_authenticated else 'EduBox | Informe público da escola'


def session_fingerprint(request):
    return salted_hmac(TOKEN_SALT, request.session.session_key or '').hexdigest()


def media_url(item, request):
    token = signing.dumps({'id': item.pk, 'user': request.user.pk,
                           'session': session_fingerprint(request), 'file': item.file.name}, salt=TOKEN_SALT)
    return item.file.url + '?' + urlencode({'access': token})


def valid_media_token(item, request):
    try:
        value = signing.loads(request.GET.get('access', ''), salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        return False
    return value == {'id': item.pk, 'user': request.user.pk,
                     'session': session_fingerprint(request), 'file': item.file.name}


def private_response(response):
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Referrer-Policy'] = 'no-referrer'
    return response


def describe_file(field, page_url, request, stream_url=None):
    suffix = Path(field.name).suffix.lower()
    info = {'viewer_label': viewer_label(request)}
    if suffix == '.pdf':
        import pypdfium2 as pdfium
        with PDF_LOCK, field.open('rb') as source:
            pdf = pdfium.PdfDocument(source.read())
            try:
                info.update(mode='pdf', page_count=len(pdf), page_url=page_url)
            finally:
                pdf.close()
    elif suffix in {'.png', '.jpg', '.jpeg', '.webp'}:
        info.update(mode='image', page_count=1, page_url=page_url)
    elif suffix == '.mp4' and stream_url:
        info.update(mode='video', stream_url=stream_url)
    else:
        raise ValueError('Este formato ainda não pode ser consultado no leitor.')
    return info


def render_page(field, request):
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    try:
        number = int(request.GET.get('page', '1'))
    except ValueError:
        return JsonResponse({'error': 'Número de página inválido.'}, status=400)
    if number < 1:
        return JsonResponse({'error': 'Página não encontrada.'}, status=404)
    suffix = Path(field.name).suffix.lower()
    try:
        if suffix == '.pdf':
            import pypdfium2 as pdfium
            with PDF_LOCK, field.open('rb') as source:
                pdf = pdfium.PdfDocument(source.read())
                try:
                    if number > len(pdf):
                        return JsonResponse({'error': 'Página não encontrada.'}, status=404)
                    page = pdf[number - 1]
                    try:
                        width, height = page.get_size()
                        if not all(math.isfinite(v) and v > 0 for v in [width, height]):
                            raise ValueError('Dimensões inválidas.')
                        bitmap = page.render(scale=min(1.7, 1400 / width, 2000 / height))
                        try:
                            picture = bitmap.to_pil().convert('RGB').copy()
                        finally:
                            bitmap.close()
                    finally:
                        page.close()
                finally:
                    pdf.close()
        elif suffix in {'.png', '.jpg', '.jpeg', '.webp'} and number == 1:
            with field.open('rb') as source, Image.open(source) as original:
                picture = ImageOps.exif_transpose(original).convert('RGB')
                picture.thumbnail((1400, 2000))
        else:
            return JsonResponse({'error': 'Página não encontrada.'}, status=404)
        label = viewer_label(request)
        try:
            font = ImageFont.truetype('DejaVuSans.ttf', 14)
        except OSError:
            font = ImageFont.load_default(size=14)
        output = Image.new('RGB', (picture.width, picture.height + 32), 'white')
        output.paste(picture, (0, 0))
        # Bake identification into both the page and footer, not a removable HTML overlay.
        layer = Image.new('RGBA', output.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        draw.text((12, max(12, picture.height // 2)), label, font=font, fill=(25, 75, 55, 55))
        draw.text((12, picture.height + 7), label, font=font, fill=(35, 65, 55, 255))
        output = Image.alpha_composite(output.convert('RGBA'), layer).convert('RGB')
        data = BytesIO()
        output.save(data, format='PNG')
        return private_response(HttpResponse(data.getvalue(), content_type='image/png'))
    except Exception:
        return JsonResponse({'error': 'Não foi possível abrir este documento. Pede à escola que verifique o ficheiro.'}, status=422)
