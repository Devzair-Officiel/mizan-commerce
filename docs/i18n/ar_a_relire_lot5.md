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

## Correctif « Votre activité » (abonné payant face aux limites réelles)

Clés nouvelles, sous `settings.usage` et `settings.subscription`. `{plan}` reçoit le nom traduit de la formule (« اكتشاف » pour l'instant).

| Clé | FR | AR | Incertain |
|---|---|---|---|
| `settings.usage.unlimited` | Illimité | غير محدود | **oui** |
| `settings.subscription.activity_after_date` | Après le {date} | بعد {date} | non |
| `settings.subscription.activity_after_date_text` | Après cette date, la formule {plan} s'applique : vos données restent intactes, mais la création est bloquée au-delà de ces plafonds. | بعد هذا التاريخ، تُطبَّق باقة {plan}: تبقى بياناتكم سليمة، لكن الإضافة تُحظر بعد هذه الحدود. | **oui** |

- `settings.usage.unlimited` : affiché seul sous le compteur des cartes « مبيعات هذا الشهر », « عملاء نشطون »… ; « غير محدود » au masculin : « غير محدودة » s'accorderait mieux avec certains libellés au pluriel.
- `settings.subscription.activity_after_date_text` : reprend la fin de `activity_after` (« تبقى بياناتكم سليمة، لكن الإضافة تُحظر بعد هذه الحدود ») ; « تُطبَّق باقة {plan} » à confirmer quand `{plan}` sera une autre formule (lot 5b).

## Lot 5b (changement de formule, changement programmé, bandeaux globaux)

Clés nouvelles sous `settings.subscription` (grille, `features`, `change`) et `layout.billing`. `{plan}`, `{target}` et `{current}` reçoivent le libellé `change.plan_period` (« باقة Boutique السنوية ») ; `{amount}` un montant formaté, `{date}` une date longue. Clés retirées (plus utilisées) : `settings.subscription.change_soon`, `layout.trial.banner_*`.

| Clé | FR | AR | Incertain |
|---|---|---|---|
| `settings.subscription.lock_past_due` | Réglez d'abord le dernier paiement. | سدّدوا آخر دفعة أولًا. | non |
| `settings.subscription.lock_cancel_scheduled` | Annulez d'abord la résiliation. | تراجعوا عن الإلغاء أولًا. | **oui** |
| `settings.subscription.change_cta` | Passer à {name} | الانتقال إلى {name} | non |
| `settings.subscription.switch_cta` | {period, select, year {Passer en annuel} other {Passer en mensuel}} | {period, select, year {الانتقال إلى الدفع السنوي} other {الانتقال إلى الدفع الشهري}} | **oui** |
| `settings.subscription.features.multi_user` | Employés et administrateurs | الموظفون والمسؤولون | non |
| `settings.subscription.features.roles_permissions` | Rôles et permissions | الأدوار والصلاحيات | non |
| `settings.subscription.features.invoice_branding` | Logo et couleur sur les factures | الشعار واللون على الفواتير | non |
| `settings.subscription.features.daily_digest` | Résumé quotidien par e-mail | ملخص يومي بالبريد الإلكتروني | **oui** |
| `settings.subscription.features.exports` | Exports | التصدير | non |
| `settings.subscription.features.ocr` | Lecture des factures fournisseur | قراءة فواتير المورّدين | **oui** |
| `settings.subscription.change.title` | Changer de formule | تغيير الباقة | non |
| `settings.subscription.change.plan_period` | {period, select, year {{plan} annuel} month {{plan} mensuel} other {{plan}}} | {period, select, year {باقة {plan} السنوية} month {باقة {plan} الشهرية} other {باقة {plan}}} | **oui** |
| `settings.subscription.change.due_today` | À payer aujourd'hui | المبلغ المستحق اليوم | non |
| `settings.subscription.change.effective_now` | Effectif immédiatement | يسري فورًا | non |
| `settings.subscription.change.next_renewal` | Prochain renouvellement : {amount} le {date} | التجديد القادم: {amount} في {date} | non |
| `settings.subscription.change.prorata` | Montant calculé au prorata du temps restant sur votre période en cours. | يُحتسب المبلغ بالتناسب مع المدة المتبقية من فترتكم الحالية. | non |
| `settings.subscription.change.no_payment_today` | Aucun paiement aujourd'hui | لا دفع اليوم | **oui** |
| `settings.subscription.change.takes_effect` | Ce changement prendra effet le {date} ; jusqu'à cette date vous gardez {plan}. | يسري هذا التغيير في {date}؛ وحتى ذلك التاريخ تبقى {plan} سارية. | **oui** |
| `settings.subscription.change.overwrites` | {kind, select, immediate {Ce changement annulera le changement déjà programmé vers {plan}.} other {Ce changement remplacera celui déjà programmé vers {plan}.}} | {kind, select, immediate {سيُلغي هذا التغيير التغييرَ المبرمج مسبقًا إلى {plan}.} other {سيحلّ هذا التغيير محلّ التغيير المبرمج مسبقًا إلى {plan}.}} | non |
| `settings.subscription.change.losses_title` | Vous perdez | ستفقدون | non |
| `settings.subscription.change.members_suspended` | Vos employés et administrateurs gardent leur compte et leurs droits, mais n'auront plus accès à la boutique tant que vous ne repasserez pas sur Boutique ou Commerce+. | يحتفظ موظفوكم ومسؤولوكم بحساباتهم وصلاحياتهم، لكن لن يتمكنوا من الوصول إلى المتجر حتى تعودوا إلى باقة Boutique أو Commerce+. | **oui** |
| `settings.subscription.change.over_limit` | Vous avez {resource, select, products {{kind, select, products {{usage, plural, one {# article actif} other {# articles actifs}}} services {{usage, plural, one {# service actif} other {# services actifs}}} other {{usage, plural, one {# article ou service actif} other {# articles et services actifs}}}}} orders_this_month {{usage, plural, one {# vente ce mois} other {# ventes ce mois}}} customers {{usage, plural, one {# client actif} other {# clients actifs}}} other {{usage, plural, one {# membre} other {# membres}}}}, la limite est {limit} : vos données sont conservées mais vous ne pourrez plus en créer. | {resource, select, products {{kind, select, products {لديكم {usage} من المنتجات النشطة} services {لديكم {usage} من الخدمات النشطة} other {لديكم {usage} من المنتجات والخدمات النشطة}}} orders_this_month {لديكم {usage} من المبيعات هذا الشهر} customers {لديكم {usage} من العملاء النشطين} other {لديكم {usage} من الأعضاء}}، والحد الأقصى {limit}: تبقى بياناتكم محفوظة لكن لن تتمكنوا من إضافة المزيد. | **oui** |
| `settings.subscription.change.confirm_pay` | Confirmer et payer {amount} | التأكيد ودفع {amount} | non |
| `settings.subscription.change.confirm_schedule` | Programmer le changement | برمجة التغيير | **oui** |
| `settings.subscription.change.amount_changed` | Le montant a changé : vérifiez avant de confirmer. | تغيّر المبلغ: تحقّقوا منه قبل التأكيد. | non |
| `settings.subscription.change.preview_expired` | L'aperçu a expiré : vérifiez le nouveau montant avant de confirmer. | انتهت صلاحية المعاينة: تحقّقوا من المبلغ الجديد قبل التأكيد. | non |
| `settings.subscription.change.done_now` | Votre formule est maintenant {plan}. | باقتكم الآن هي {plan}. | non |
| `settings.subscription.change.done_scheduled` | {dated, select, yes {Changement programmé pour le {date}.} other {Changement programmé.}} | {dated, select, yes {بُرمج التغيير ليوم {date}.} other {بُرمج التغيير.}} | **oui** |
| `settings.subscription.change.scheduled_notice` | {dated, select, yes {Passage à {target} le {date}.} other {Passage à {target} en fin de période.}} Vous gardez {current} d'ici là. | {dated, select, yes {الانتقال إلى {target} في {date}.} other {الانتقال إلى {target} في نهاية الفترة.}} تبقى {current} سارية حتى ذلك الحين. | **oui** |
| `settings.subscription.change.cancel_cta` | Annuler ce changement | إلغاء هذا التغيير | non |
| `settings.subscription.change.cancelled` | Changement de formule annulé. | أُلغي تغيير الباقة. | non |
| `settings.subscription.change.errors.payment_failed` | Le paiement n'a pas abouti. Mettez à jour votre moyen de paiement puis réessayez. | لم يتمّ الدفع. حدّثوا وسيلة الدفع ثم أعيدوا المحاولة. | non |
| `settings.subscription.change.errors.change_not_supported` | Ce changement doit se faire en deux temps : changez d'abord de formule, puis de période. | يجب إجراء هذا التغيير على مرحلتين: غيّروا الباقة أولًا، ثم فترة الفوترة. | non |
| `settings.subscription.change.errors.payment_overdue` | Le dernier paiement a échoué : réglez-le d'abord, puis changez de formule. | تعذّر آخر دفع: سدّدوه أولًا، ثم غيّروا الباقة. | non |
| `settings.subscription.change.errors.cancellation_scheduled` | Une résiliation est programmée : annulez-la d'abord, puis changez de formule. | الإلغاء مُبرمج: تراجعوا عنه أولًا، ثم غيّروا الباقة. | **oui** |
| `settings.subscription.change.errors.no_change` | C'est déjà votre formule actuelle. | هذه باقتكم الحالية بالفعل. | non |
| `settings.subscription.change.errors.use_checkout` | Votre abonnement n'est plus actif : choisissez une formule pour souscrire. | اشتراككم لم يعد مفعّلًا: اختاروا باقة للاشتراك. | non |
| `settings.subscription.change.errors.nothing_scheduled` | Aucun changement n'est plus programmé. | لم يعد هناك أي تغيير مبرمج. | non |
| `settings.subscription.change.errors.unavailable` | Le paiement n'est pas disponible pour le moment. | الدفع غير متاح حاليًا. | non |
| `settings.subscription.change.errors.owner_only` | Seul le propriétaire de la boutique peut modifier l'abonnement. | وحده مالك المتجر يمكنه تعديل الاشتراك. | non |
| `settings.subscription.change.errors.throttled` | Trop de tentatives, réessayez dans quelques minutes. | محاولات كثيرة، حاولوا مجددًا بعد بضع دقائق. | non |
| `settings.subscription.change.errors.change_failed` | Une erreur est survenue, aucun paiement n'a été effectué. | حدث خطأ، ولم يُخصم أي مبلغ. | non |
| `settings.subscription.change.errors.cancel_change_failed` | Impossible d'annuler ce changement pour le moment. Réessayez plus tard. | تعذّر إلغاء هذا التغيير حاليًا. حاولوا لاحقًا. | non |
| `layout.billing.past_due` | {dated, select, yes {Le dernier paiement a échoué : votre accès est conservé jusqu'au {date}.} other {Le dernier paiement a échoué.}} | {dated, select, yes {تعذّر آخر دفع: يبقى وصولكم محفوظًا حتى {date}.} other {تعذّر آخر دفع.}} | non |
| `layout.billing.past_due_admin` | Contactez le propriétaire de la boutique. | تواصلوا مع مالك المتجر. | non |
| `layout.billing.past_due_cta` | Mettre à jour mon moyen de paiement | تحديث وسيلة الدفع | non |
| `layout.billing.trial_end` | Votre essai gratuit se termine {date} à {time}. | تنتهي تجربتكم المجانية يوم {date} الساعة {time}. | **oui** |
| `layout.billing.trial_end_cta` | Choisir une formule | اختيار باقة | non |
| `layout.billing.dismiss` | Masquer | إخفاء | non |

### Points incertains (lot 5b)

- `settings.subscription.lock_cancel_scheduled` : « تراجعوا عن الإلغاء » pour « Annulez d'abord la résiliation » : « ألغوا الإلغاء » évité (répétition) ; à confirmer.
- `settings.subscription.switch_cta` : « الانتقال إلى الدفع السنوي » pour « Passer en annuel » : la période est rendue par « الدفع » ; « الاشتراك السنوي » possible.
- `settings.subscription.features.daily_digest` : « ملخص يومي بالبريد الإلكتروني » : « بريد إلكتروني » ou « البريد » seul selon l'usage du reste de l'interface.
- `settings.subscription.features.ocr` : « قراءة فواتير المورّدين » : le terme technique (« التعرّف الضوئي ») a été volontairement évité.
- `settings.subscription.change.plan_period` : « باقة {plan} السنوية » : accord au féminin avec « باقة » ; le nom latin (Boutique, Commerce+) dans une phrase arabe est à vérifier visuellement (sens bidi).
- `settings.subscription.change.no_payment_today` : « لا دفع اليوم » est très bref ; « لن يُخصم أي مبلغ اليوم » serait plus naturel mais plus long.
- `settings.subscription.change.takes_effect` : « تبقى {plan} سارية » (« vous gardez {plan} ») : tournure impersonnelle, à confirmer.
- `settings.subscription.change.members_suspended` : phrase longue, « حتى تعودوا إلى باقة Boutique أو Commerce+ » ; noms de formules en latin.
- `settings.subscription.change.over_limit` : « لديكم {usage} من المنتجات النشطة » : les pluriels ICU du français ne sont pas reproduits (« من » + pluriel couvre tous les nombres) ; à valider pour 1 et 2 (duel).
- `settings.subscription.change.done_scheduled` : « بُرمج التغيير ليوم {date} » : « مُجدول » éventuellement plus naturel (même question que `cancel_scheduled`).
- `settings.subscription.change.scheduled_notice` : deux phrases, « تبقى {current} سارية حتى ذلك الحين » ; branche sans date (« في نهاية الفترة »).
- `settings.subscription.change.confirm_schedule` : « برمجة التغيير » pour un bouton : « جدولة التغيير » possible.
- `settings.subscription.change.errors.cancellation_scheduled` : « الإلغاء مُبرمج » : même question « مُبرمج / مُجدول ».
- `layout.billing.trial_end` : « يوم {date} الساعة {time} » : `{date}` contient déjà le jour de la semaine (« الأحد 25 أكتوبر ») ; « يوم » peut faire doublon.
