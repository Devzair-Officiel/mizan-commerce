"""Textes par défaut des modèles de messages WhatsApp, par langue et par ton.

Variables : {client}, {commande}, {date}, {total}, {reste}, {articles}, {boutique}.
Ton chaleureux : {client} est le prénom. Ton professionnel : le nom complet
(l'application ne connaît pas la civilité).

`tracking` : commande prête (retrait sur place) ; `tracking_delivery` : remise au
livreur, pour une boutique qui livre (`fulfillment_mode = delivery`).
"""

from __future__ import annotations

WARM = 'warm'
PROFESSIONAL = 'professional'

DEFAULT_TEXTS: dict[str, dict[str, dict[str, str]]] = {
    'fr': {
        WARM: {
            'order_confirmation': (
                'Bonjour {client} 😊\n'
                'Merci pour votre commande {commande} ! '
                'Nous avons bien noté : {articles}.\n'
                "Total : {total}. Nous vous prévenons dès qu'elle est prête.\n"
                '{boutique}'
            ),
            'tracking': (
                'Bonne nouvelle {client} 🎉\n'
                'Votre commande {commande} est prête ! Vous pouvez passer la récupérer '
                'quand ça vous arrange.\n'
                'À très vite !\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'Bonne nouvelle {client} 🎉\n'
                "Votre commande {commande} vient d'être remise au livreur, "
                'elle arrive très bientôt !\n'
                'À très vite !\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'Bonjour {client} 😊\n'
                'Petit rappel pour votre commande {commande} du {date} : '
                'il reste {reste} à régler.\n'
                'Vous pouvez passer à la boutique quand ça vous arrange, '
                'ou payer à la livraison.\n'
                'Merci et à bientôt !\n'
                '{boutique}'
            ),
            'thank_you': (
                'Merci {client} 🙏\n'
                "C'était un plaisir de préparer votre commande {commande}. "
                'Au plaisir de vous revoir très vite !\n'
                '{boutique}'
            ),
            'promo': (
                'Bonjour {client} 😊\n'
                'Nous avons une nouvelle offre qui pourrait vous plaire ! '
                'Passez nous voir ou répondez à ce message pour en savoir plus.\n'
                'À bientôt !\n'
                '{boutique}'
            ),
            'greeting': 'Bonjour {client} 😊',
        },
        PROFESSIONAL: {
            'order_confirmation': (
                'Bonjour {client},\n'
                'Nous vous confirmons la bonne réception de votre commande '
                '{commande} : {articles}.\n'
                'Montant total : {total}. '
                "Nous vous informerons dès qu'elle sera prête.\n"
                'Cordialement,\n'
                '{boutique}'
            ),
            'tracking': (
                'Bonjour {client},\n'
                'Votre commande {commande} est prête. Vous pouvez venir la retirer '
                "aux heures d'ouverture de la boutique.\n"
                'Cordialement,\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'Bonjour {client},\n'
                'Votre commande {commande} a été remise au livreur. '
                'Elle vous sera livrée prochainement.\n'
                'Cordialement,\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'Bonjour {client},\n'
                'Sauf erreur de notre part, la commande {commande} du {date} '
                'présente un solde de {reste} restant à régler.\n'
                'Nous vous remercions de bien vouloir procéder au règlement '
                'à votre convenance.\n'
                'Cordialement,\n'
                '{boutique}'
            ),
            'thank_you': (
                'Bonjour {client},\n'
                'Nous vous remercions pour votre commande {commande} '
                'et pour votre confiance.\n'
                'Cordialement,\n'
                '{boutique}'
            ),
            'promo': (
                'Bonjour {client},\n'
                'Nous avons le plaisir de vous présenter une nouvelle offre '
                "susceptible de vous intéresser. N'hésitez pas à nous contacter "
                'pour en savoir plus.\n'
                'Cordialement,\n'
                '{boutique}'
            ),
            'greeting': 'Bonjour {client},',
        },
    },
    'en': {
        WARM: {
            'order_confirmation': (
                'Hi {client} 😊\n'
                'Thanks for your order {commande}! We have noted: {articles}.\n'
                "Total: {total}. We'll let you know as soon as it's ready.\n"
                '{boutique}'
            ),
            'tracking': (
                'Good news {client} 🎉\n'
                'Your order {commande} is ready! '
                'Drop by to pick it up whenever suits you.\n'
                'See you soon!\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'Good news {client} 🎉\n'
                'Your order {commande} has just been handed to the courier, '
                'it will be with you very soon!\n'
                'See you soon!\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'Hi {client} 😊\n'
                'A quick reminder about your order {commande} from {date}: '
                '{reste} is still to be paid.\n'
                'You can drop by the shop whenever suits you, or pay on delivery.\n'
                'Thanks and see you soon!\n'
                '{boutique}'
            ),
            'thank_you': (
                'Thank you {client} 🙏\n'
                'It was a pleasure to prepare your order {commande}. '
                'Hope to see you again soon!\n'
                '{boutique}'
            ),
            'promo': (
                'Hi {client} 😊\n'
                'We have a new offer you might like! Drop by or reply to this message '
                'to find out more.\n'
                'See you soon!\n'
                '{boutique}'
            ),
            'greeting': 'Hi {client} 😊',
        },
        PROFESSIONAL: {
            'order_confirmation': (
                'Dear {client},\n'
                'We confirm receipt of your order {commande}: {articles}.\n'
                'Total amount: {total}. We will let you know as soon as it is ready.\n'
                'Kind regards,\n'
                '{boutique}'
            ),
            'tracking': (
                'Dear {client},\n'
                'Your order {commande} is ready. You may collect it during '
                "the shop's opening hours.\n"
                'Kind regards,\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'Dear {client},\n'
                'Your order {commande} has been handed to the courier. '
                'It will be delivered to you shortly.\n'
                'Kind regards,\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'Dear {client},\n'
                'Unless we are mistaken, order {commande} of {date} has an outstanding '
                'balance of {reste}.\n'
                'We would be grateful if you could settle it at your convenience.\n'
                'Kind regards,\n'
                '{boutique}'
            ),
            'thank_you': (
                'Dear {client},\n'
                'Thank you for your order {commande} and for your trust.\n'
                'Kind regards,\n'
                '{boutique}'
            ),
            'promo': (
                'Dear {client},\n'
                'We are pleased to present a new offer that may interest you. '
                'Please do not hesitate to contact us for more information.\n'
                'Kind regards,\n'
                '{boutique}'
            ),
            'greeting': 'Dear {client},',
        },
    },
    'ar': {
        WARM: {
            'order_confirmation': (
                'مرحبًا {client} 😊\n'
                'شكرًا على طلبك {commande}! سجّلنا: {articles}.\n'
                'المجموع: {total}. سنخبرك فور تجهيزه.\n'
                '{boutique}'
            ),
            'tracking': (
                'خبر سار {client} 🎉\n'
                'طلبك {commande} جاهز! يمكنك المرور لاستلامه في الوقت الذي يناسبك.\n'
                'إلى اللقاء قريبًا!\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'خبر سار {client} 🎉\n'
                'تم تسليم طلبك {commande} لعامل التوصيل، وسيصلك قريبًا جدًا!\n'
                'إلى اللقاء قريبًا!\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'مرحبًا {client} 😊\n'
                'تذكير بسيط بخصوص طلبك {commande} بتاريخ {date}: '
                'لا يزال {reste} مستحقًا.\n'
                'يمكنك المرور بالمحل متى ناسبك، أو الدفع عند التوصيل.\n'
                'شكرًا وإلى اللقاء!\n'
                '{boutique}'
            ),
            'thank_you': (
                'شكرًا {client} 🙏\n'
                'سعدنا بتجهيز طلبك {commande}. نتمنى رؤيتك قريبًا!\n'
                '{boutique}'
            ),
            'promo': (
                'مرحبًا {client} 😊\n'
                'لدينا عرض جديد قد يعجبك! مرّ بنا أو ردّ على هذه الرسالة لمعرفة المزيد.\n'
                'إلى اللقاء!\n'
                '{boutique}'
            ),
            'greeting': 'مرحبًا {client} 😊',
        },
        PROFESSIONAL: {
            'order_confirmation': (
                'السيد(ة) {client}،\n'
                'نؤكد لكم استلام طلبكم {commande}: {articles}.\n'
                'المبلغ الإجمالي: {total}. سنعلمكم فور تجهيزه.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'tracking': (
                'السيد(ة) {client}،\n'
                'طلبكم {commande} جاهز. يمكنكم استلامه خلال ساعات عمل المحل.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'tracking_delivery': (
                'السيد(ة) {client}،\n'
                'تم تسليم طلبكم {commande} لعامل التوصيل، وسيصلكم قريبًا.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'unpaid_followup': (
                'السيد(ة) {client}،\n'
                'ما لم نكن مخطئين، لا يزال على الطلب {commande} بتاريخ {date} '
                'رصيد مستحق قدره {reste}.\n'
                'نشكركم على تسويته في الوقت الذي يناسبكم.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'thank_you': (
                'السيد(ة) {client}،\n'
                'نشكركم على طلبكم {commande} وعلى ثقتكم.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'promo': (
                'السيد(ة) {client}،\n'
                'يسعدنا أن نقدم لكم عرضًا جديدًا قد يهمكم. '
                'لا تترددوا في التواصل معنا لمزيد من المعلومات.\n'
                'مع خالص التحية،\n'
                '{boutique}'
            ),
            'greeting': 'السيد(ة) {client}،',
        },
    },
}

# Exemple fictif de l'aperçu, quand la boutique n'a encore aucune commande.
SAMPLE: dict[str, dict[str, object]] = {
    'fr': {
        'customer': 'Karima Bensouda',
        'items': ["2 × Savon à l'huile d'olive", "1 × Huile d'argan"],
    },
    'en': {
        'customer': 'Karima Bensouda',
        'items': ['2 × Olive oil soap', '1 × Argan oil'],
    },
    'ar': {
        'customer': 'كريمة بنسودة',
        'items': ['2 × صابون بزيت الزيتون', '1 × زيت الأركان'],
    },
}
