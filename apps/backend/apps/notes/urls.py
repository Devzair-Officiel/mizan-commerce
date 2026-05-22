from django.urls import path
from .views import NoteListCreateView, NoteDetailView, ReminderListCreateView, ReminderDetailView, ReminderDoneView, ReminderReopenView

urlpatterns = [
    path('notes/', NoteListCreateView.as_view(), name='note-list'),
    path('notes/<uuid:pk>/', NoteDetailView.as_view(), name='note-detail'),
    path('reminders/', ReminderListCreateView.as_view(), name='reminder-list'),
    path('reminders/<uuid:pk>/', ReminderDetailView.as_view(), name='reminder-detail'),
    path('reminders/<uuid:pk>/done/', ReminderDoneView.as_view(), name='reminder-done'),
    path('reminders/<uuid:pk>/reopen/', ReminderReopenView.as_view(), name='reminder-reopen'),
]
