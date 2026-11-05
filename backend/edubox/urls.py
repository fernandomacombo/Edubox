from django.conf import settings
from learning.views import resource_file
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("learning.urls")),
    path("media/<path:path>", resource_file),
]
admin.site.site_header = "EduBox — Gestão de conteúdos"
admin.site.site_title = "EduBox Administração"
admin.site.index_title = "Painel do professor"
