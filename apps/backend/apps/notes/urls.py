from django.urls import path
from .views import (
    NoteDetailView, NoteListCreateView, ReminderAssigneeListView, ReminderDetailView,
    ReminderDoneView, ReminderListCreateView, ReminderReopenView, ReminderSettingsView,
    ReminderSummaryView,
)

urlpatterns = [
    path('notes/', NoteListCreateView.as_view(), name='note-list'),
    path('notes/<uuid:pk>/', NoteDetailView.as_view(), name='note-detail'),
    path('reminders/', ReminderListCreateView.as_view(), name='reminder-list'),
    path('reminders/assignees/', ReminderAssigneeListView.as_view(), name='reminder-assignees'),  # noqa: E501
    path('reminders/settings/', ReminderSettingsView.as_view(), name='reminder-settings'),  # noqa: E501
    path('reminders/summary/', ReminderSummaryView.as_view(), name='reminder-summary'),  # noqa: E501
    path('reminders/<uuid:pk>/', ReminderDetailView.as_view(), name='reminder-detail'),
    path('reminders/<uuid:pk>/done/', ReminderDoneView.as_view(), name='reminder-done'),
    path('reminders/<uuid:pk>/reopen/', ReminderReopenView.as_view(), name='reminder-reopen'),  # noqa: E501
]
