# Arabe à relire — lot 5a (abonnement Stripe, frontend)

Clés nouvelles ou modifiées dans `apps/frontend/messages/ar.json`, sous `settings.subscription`.
Ton : vouvoiement pluriel, « اكتشاف » pour Découverte, « ميزان » pour Mizan.
Colonne « Incertain » : **oui** quand une tournure mérite un avis ; la raison suit le tableau.

Clés supprimées (plus utilisées) : `payment_pending`, `payment_ok`. Clé modifiée : `checkout_title` (était « {name} · {price} {period…} »).

| Clé | FR | AR | Incertain |
|---|---|---|---|
| `settings.subscription.checkout_title` | Souscrire à {name} | الاشتراك في باقة {name} | non |
| `settings.subscription.checkout_renewal` | Votre abonnement se renouvelle automatiquement {period, select, year {chaque année} other {chaque mois}}. Résiliable à tout moment depuis Mizan. | يتجدّد اشتراككم تلقائيًا {period, select, year {كل سنة} other {كل شهر}}. يمكنكم إلغاؤه في أي وقت من ميزان. | non |
| `settings.subscription.checkout_trial_ends` | Votre essai gratuit prend fin dès le paiement : vous êtes débité aujourd'hui. | تنتهي تجربتكم المجانية فور الدفع: يُخصم المبلغ اليوم. | **oui** |
| `settings.subscription.checkout_cta` | Continuer vers le paiement sécurisé | المتابعة إلى الدفع الآمن | non |
| `settings.subscription.checkout_back` | Retour | رجوع | non |
| `settings.subscription.owner_only` | Seul le propriétaire de la boutique peut modifier l'abonnement. | وحده مالك المتجر يمكنه تعديل الاشتراك. | non |
| `settings.subscription.change_soon` | Le changement de formule arrive bientôt. | سيُتاح تغيير الباقة قريبًا. | non |
| `settings.subscription.renewal_line` | Prochain renouvellement le {date} · {amount} | التجديد القادم في {date} · {amount} | non |
| `settings.subscription.portal_cta` | Gérer le paiement et les factures | إدارة الدفع والفواتير | non |
| `settings.subscription.cancel_scheduled` | Résiliation programmée : votre accès reste complet jusqu'au {date}, puis votre boutique passera sur Découverte. Vos données sont conservées. | الإلغاء مُبرمج: يبقى وصولكم كاملًا حتى {date}، ثم ينتقل متجركم إلى باقة اكتشاف. بياناتكم محفوظة. | **oui** |
| `settings.subscription.resume_cta` | Garder mon abonnement | الاحتفاظ باشتراكي | non |
| `settings.subscription.past_due` | Le dernier paiement a échoué. Votre accès est conservé jusqu'au {date}. | تعذّر آخر دفع. يبقى وصولكم محفوظًا حتى {date}. | **oui** |
| `settings.subscription.past_due_cta` | Mettre à jour mon moyen de paiement | تحديث وسيلة الدفع | non |
| `settings.subscription.past_due_owner` | Contactez le propriétaire de la boutique. | تواصلوا مع مالك المتجر. | non |
| `settings.subscription.cancel_cta_stripe` | Résilier mon abonnement | إلغاء اشتراكي | non |
| `settings.subscription.cancel_title_stripe` | Résilier votre abonnement ? | إلغاء اشتراككم؟ | non |
| `settings.subscription.cancel_text_stripe` | {mode, select, past_due {Votre abonnement sera résilié immédiatement et votre boutique passera sur Découverte, sans remboursement. Vos données sont conservées.} other {Votre abonnement restera actif jusqu'au {date}. Ensuite votre boutique passera sur Découverte, sans remboursement. Vos données sont conservées.}} | {mode, select, past_due {سيُلغى اشتراككم فورًا وينتقل متجركم إلى باقة اكتشاف، دون استرداد. بياناتكم محفوظة.} other {يبقى اشتراككم مفعّلًا حتى {date}. بعدها ينتقل متجركم إلى باقة اكتشاف، دون استرداد. بياناتكم محفوظة.}} | **oui** |
| `settings.subscription.cancel_hint_stripe` | {mode, select, past_due {Résiliation immédiate, vos données sont conservées.} other {Accès complet jusqu'à la fin de la période payée, vos données sont conservées.}} | {mode, select, past_due {إلغاء فوري، وبياناتكم محفوظة.} other {وصول كامل حتى نهاية الفترة المدفوعة، وبياناتكم محفوظة.}} | **oui** |
| `settings.subscription.errors.already_subscribed` | Vous avez déjà un abonnement. | لديكم اشتراك بالفعل. | non |
| `settings.subscription.errors.unavailable` | Le paiement n'est pas disponible pour le moment. | الدفع غير متاح حاليًا. | non |
| `settings.subscription.errors.throttled` | Trop de tentatives, réessayez dans quelques minutes. | محاولات كثيرة، حاولوا مجددًا بعد بضع دقائق. | **oui** |
| `settings.subscription.errors.checkout_failed` | Une erreur est survenue, aucun paiement n'a été effectué. | حدث خطأ، ولم يُخصم أي مبلغ. | non |
| `settings.subscription.errors.portal_failed` | Impossible d'ouvrir l'espace de paiement pour le moment. Réessayez plus tard. | تعذّر فتح صفحة الدفع حاليًا. حاولوا لاحقًا. | non |
| `settings.subscription.errors.cancel_failed` | Impossible de résilier pour le moment. Réessayez plus tard. | تعذّر الإلغاء حاليًا. حاولوا لاحقًا. | non |
| `settings.subscription.errors.resume_failed` | Impossible de garder votre abonnement pour le moment. Réessayez plus tard. | تعذّر الاحتفاظ باشتراككم حاليًا. حاولوا لاحقًا. | non |
| `settings.subscription.checkout_return.confirming` | Nous confirmons votre paiement… | جارٍ تأكيد دفعكم… | non |
| `settings.subscription.checkout_return.active` | Votre abonnement {name} est actif. | اشتراككم في باقة {name} مفعّل. | non |
| `settings.subscription.checkout_return.pending` | Votre paiement est en cours de traitement. Actualisez dans un instant ; si rien ne change, écrivez-nous à support@mizan-commerce.com. | دفعكم قيد المعالجة. حدّثوا الصفحة بعد لحظات؛ وإن لم يتغيّر شيء، راسلونا على support@mizan-commerce.com. | **oui** |
| `settings.subscription.checkout_return.reload` | Actualiser | تحديث | non |
| `settings.subscription.checkout_return.cancelled` | Paiement annulé : rien n'a été débité. | أُلغي الدفع: لم يُخصم أي مبلغ. | non |

## Points incertains

- `settings.subscription.cancel_scheduled` : « مُبرمج » pour « programmée » : « مُجدول » est peut-être plus naturel.
- `settings.subscription.past_due` : « تعذّر آخر دفع » pour « a échoué » : à confirmer face à « فشل ».
- `settings.subscription.checkout_trial_ends` : « يُخصم المبلغ اليوم » (tournure impersonnelle) pour « vous êtes débité ».
- `settings.subscription.cancel_text_stripe` : « دون استرداد » pour « sans remboursement » ; deux branches (past_due / autre).
- `settings.subscription.cancel_hint_stripe` : Formulation courte sous le bouton ; deux branches (past_due / autre).
- `settings.subscription.errors.throttled` : « محاولات كثيرة » : peut-être « محاولات كثيرة جدًا ».
- `settings.subscription.checkout_return.pending` : « حدّثوا الصفحة » pour « Actualisez » ; ponctuation « ؛ » à vérifier.
