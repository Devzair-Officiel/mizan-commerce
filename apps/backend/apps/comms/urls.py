from django.urls import path

from .views import (
    PreparedMessageDetailView,
    PreparedMessageListCreateView,
    PreparedMessageMarkSentView,
)

urlpatterns = [
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
