from django.urls import path
from . import views, portal_views

urlpatterns = [
    path('portal/session/', portal_views.session, name='portal_session'),
    path('portal/login/', portal_views.sign_in, name='portal_login'),
    path('portal/logout/', portal_views.sign_out, name='portal_logout'),
    path('portal/classes/', portal_views.classes, name='portal_classes'),
    path('portal/classes/<int:pk>/enroll/', portal_views.enroll, name='portal_enroll'),
    path('portal/assignments/', portal_views.assignments, name='portal_assignments'),
    path('portal/assignments/<int:pk>/file/', portal_views.assignment_file, name='portal_assignment_file'),
    path('portal/assignments/<int:pk>/submit/', portal_views.submit, name='portal_submit'),
    path('portal/assignments/<int:pk>/responses/', portal_views.responses, name='portal_responses'),
    path('portal/responses/<int:pk>/grade/', portal_views.grade_submission, name='portal_grade'),
    path("health/", views.health, name="health"),
    path("subjects/", views.subjects, name="subjects"),
    path("resources/", views.resources, name="resources"),
    path("quizzes/", views.quizzes, name="quizzes"),
    path("quizzes/<int:quiz_id>/", views.quiz_detail, name="quiz_detail"),
    path("quizzes/<int:quiz_id>/submit/", views.submit_quiz, name="submit_quiz"),
    path("csrf/", views.csrf_token, name="csrf_token"),
]
