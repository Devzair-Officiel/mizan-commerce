from django.urls import path

from .views import (
    MessageComposeView,
    MessagePreviewView,
    MessageSettingsView,
    PreparedMessageDetailView,
    PreparedMessageListCreateView,
    PreparedMessageMarkSentView,
)

urlpatterns = [
    path('messages/settings/', MessageSettingsView.as_view(), name='message-settings'),
    path('messages/preview/', MessagePreviewView.as_view(), name='message-preview'),
    path('messages/compose/', MessageComposeView.as_view(), name='message-compose'),
    path(
        'messages/prepared/',
        PreparedMessageListCreateView.as_view(),
        name='prepared-message-list',
    ),
    path(
        'messages/prepared/<uuid:pk>/',
        PreparedMessageDetailView.as_view(),
        name='prepared-message-detail',
    ),
    path(
        'messages/prepared/<uuid:pk>/mark-sent/',
        PreparedMessageMarkSentView.as_view(),
        name='prepared-message-mark-sent',
    ),
]
