"""Libellés du justificatif zakat, en français et en anglais. Un compte en arabe reçoit
le français en attendant le PDF en arabe (dette partagée avec les factures).

« Qui la retient » : textes du référentiel (`docs/zakat_referentiel.md`, § 4).
"""

_OPTIONS_FR = {
    'option.nisab_method.silver': 'Argent, 595 g',
    'option.nisab_method.gold': 'Or, 85 g',
    'option.calendar.hijri': 'Année hégirienne',
    'option.calendar.gregorian': 'Année solaire',
    'option.stock_valuation.sale': 'Prix de vente au jour J',
    'option.stock_valuation.purchase': "Prix d'achat",
    'option.receivables_mode.yearly': 'Comptées chaque année',
    'option.receivables_mode.on_collection': "Versées à l'encaissement",
    'option.debts_mode.all': 'Toutes les dettes envers des personnes',
    'option.debts_mode.within_12_months': 'Seulement ce qui est dû dans les 12 mois',
    'option.debts_mode.none': 'Aucune dette',
    'who.nisab_method.silver': (
        'Ceux qui retiennent le seuil le plus favorable aux pauvres ; '
        'Islamic Relief le conseille'
    ),
    'who.nisab_method.gold': "Ceux qui jugent que l'argent ne reflète plus la richesse",
    'who.calendar.hijri': 'Taux de 2,5 %',
    'who.calendar.gregorian': 'Taux de 2,5775 %, norme AAOIFI n° 35',
    'who.stock_valuation.sale': 'Quatre écoles (valeur au jour J) ; fatwas contemporaines',  # noqa: E501
    'who.stock_valuation.purchase': (
        'Norme AAOIFI n° 35 : seulement si la valeur actuelle est inconnue'
    ),
    'who.receivables_mode.yearly': (
        'Chaféites ; Malikites pour les ventes du commerçant régulier'
    ),
    'who.receivables_mode.on_collection': 'Hanafites, Hanbalites',
    'who.debts_mode.all': (
        "Hanafites, Malikites, Hanbalites, ancien avis d'al-Shâfi'î ; "
        'chaque école pose ses conditions'
    ),
    'who.debts_mode.within_12_months': 'Norme AAOIFI n° 35 ; avis contemporains',
    'who.debts_mode.none': "Al-Shâfi'î (nouvel avis) ; Ibn Bâz",
}

_OPTIONS_EN = {
    'option.nisab_method.silver': 'Silver, 595 g',
    'option.nisab_method.gold': 'Gold, 85 g',
    'option.calendar.hijri': 'Hijri year',
    'option.calendar.gregorian': 'Solar year',
    'option.stock_valuation.sale': 'Selling price on your zakat day',
    'option.stock_valuation.purchase': 'Purchase price',
    'option.receivables_mode.yearly': 'Counted every year',
    'option.receivables_mode.on_collection': 'Paid on collection',
    'option.debts_mode.all': 'All debts owed to people',
    'option.debts_mode.within_12_months': 'Only what is due within 12 months',
    'option.debts_mode.none': 'No debts',
    'who.nisab_method.silver': (
        'Those who hold the threshold most favourable to the poor; '
        'Islamic Relief recommends it'
    ),
    'who.nisab_method.gold': 'Those who consider that silver no longer reflects wealth',
    'who.calendar.hijri': 'Rate of 2.5%',
    'who.calendar.gregorian': 'Rate of 2.5775%, AAOIFI standard no. 35',
    'who.stock_valuation.sale': (
        'Four schools (value on your zakat day); contemporary fatwas'
    ),
    'who.stock_valuation.purchase': (
        'AAOIFI standard no. 35: only if the current value is unknown'
    ),
    'who.receivables_mode.yearly': "Shafiis; Malikis for a regular trader's sales",
    'who.receivables_mode.on_collection': 'Hanafis, Hanbalis',
    'who.debts_mode.all': (
        "Hanafis, Malikis, Hanbalis, al-Shafii's earlier opinion; "
        'each school sets its own conditions'
    ),
    'who.debts_mode.within_12_months': 'AAOIFI standard no. 35; contemporary opinions',
    'who.debts_mode.none': 'Al-Shafii (later opinion); Ibn Baz',
}

LABELS: dict[str, dict[str, str]] = {
    'fr': {
        'page': 'Page {page} sur {total}',
        'title': 'Justificatif de zakat {year}',
        'year_hijri': '{year} H',
        'for': 'Établi pour {name}',
        'hawl_day': 'Jour J',
        'state_at': 'État au {date}, {time}',
        'estimate': "Estimation. Les choix d'avis sont les vôtres.",
        'verdict.above_nisab': 'Au-dessus du seuil',
        'verdict.above_nisab.text': 'Votre base de {base} dépasse le seuil de {threshold}.',  # noqa: E501
        'verdict.below_nisab': 'Pas de zakat sur ce que vous avez déclaré',
        'verdict.below_nisab.text': (
            'Votre base de {base} reste sous le seuil de {threshold}.'
        ),
        'verdict.nisab_unknown': 'Seuil inconnu',
        'verdict.nisab_unknown.text': (
            "Le prix du gramme n'est pas saisi : la base n'est pas comparée au seuil."
        ),
        'verdict.choice_missing': 'Choix à faire',
        'verdict.choice_missing.text': (
            'Mizan ne choisit pas à votre place. Reste à choisir : {choices}.'
        ),
        'zakat_now': 'Zakat à verser maintenant',
        'zakat_on_collection': "Zakat à verser à l'encaissement de vos créances",
        'not_computed': 'Non calculée',
        'calculation': 'Le calcul',
        'cash': 'Trésorerie : caisse et banque',
        'stock.sale': 'Stock au prix de vente au jour J',
        'stock.purchase': "Stock au prix d'achat",
        'stock.missing': 'Stock, valeur à choisir',
        'receivables': 'Créances sûres',
        'receivables.on_collection': (
            "Comptées dans la base ; leur zakat se verse à l'encaissement."
        ),
        'other_asset': 'Autre bien : {label}',
        'other_none': 'Autres biens : aucun compté',
        'debts.all': 'Toutes les dettes',
        'debts.within_12_months': 'Dettes dues dans les 12 mois',
        'debts.none': 'Dettes, aucune déduite',
        'debts.missing': 'Dettes, choix à faire',
        'base': 'Base',
        'threshold.silver': "Seuil, 595 g d'argent",
        'threshold.gold': "Seuil, 85 g d'or",
        'threshold.missing': 'Seuil, référence à choisir',
        'threshold_price': 'Prix du gramme {price}, saisi le {date}',
        'threshold_price_undated': 'Prix du gramme {price}',
        'threshold_price_missing': 'Prix du gramme non saisi',
        'share': 'Votre part de la boutique',
        'share_text': (
            'Appliquée à la trésorerie, au stock, aux créances et aux dettes, '
            'pas aux autres biens.'
        ),
        'rate.hijri': 'Taux, année hégirienne',
        'rate.gregorian': 'Taux, année solaire',
        'rate.missing': 'Taux, année à choisir',
        'zakat_total': 'Zakat estimée',
        'outside': 'Hors base',
        'outside_hint': 'Gardé pour mémoire, non additionné.',
        'outside_doubtful': 'Créance douteuse, {label}',
        'outside_doubtful_text': "Rien à verser tant qu'elle n'est pas encaissée.",
        'outside_not_counted_text': 'Ajouté mais non compté : votre choix.',
        'outside_usage': "Biens d'usage",
        'outside_usage_text': 'Local, véhicule, matériel, mobilier : non comptés.',
        'choices': "Vos choix d'avis",
        'choices_hint': "Là où les avis divergent, c'est vous qui choisissez.",
        'choice_missing': 'À choisir',
        'choice.nisab_method': 'Seuil de référence',
        'choice.calendar': 'Année de calcul',
        'choice.stock_valuation': 'Valeur du stock',
        'choice.receivables_mode': 'Créances sûres',
        'choice.debts_mode': 'Dettes déduites',
        **_OPTIONS_FR,
        'limits': 'Limites',
        'limit.personal': (
            'La zakat est personnelle : Mizan additionne ce que vous déclarez, '
            "boutique et autres biens. Ce qui n'est pas déclaré n'est pas compté."
        ),
        'limit.partners': 'Associés : chacun verse sur sa part.',
        'limit.real_estate': (
            'Immobilier : saisie libre, sans calcul automatique ni avis de Mizan.'
        ),
    },
    'en': {
        'page': 'Page {page} of {total}',
        'title': 'Zakat statement {year}',
        'year_hijri': '{year} AH',
        'for': 'Prepared for {name}',
        'hawl_day': 'Zakat day',
        'state_at': 'As of {date}, {time}',
        'estimate': 'Estimate. The opinions chosen are yours.',
        'verdict.above_nisab': 'Above the threshold',
        'verdict.above_nisab.text': (
            'Your base of {base} is above the threshold of {threshold}.'
        ),
        'verdict.below_nisab': 'No zakat on what you declared',
        'verdict.below_nisab.text': (
            'Your base of {base} stays below the threshold of {threshold}.'
        ),
        'verdict.nisab_unknown': 'Threshold unknown',
        'verdict.nisab_unknown.text': (
            'The price per gram is not entered: the base is not compared with the '
            'threshold.'
        ),
        'verdict.choice_missing': 'Choice to make',
        'verdict.choice_missing.text': (
            'Mizan does not choose for you. Still to choose: {choices}.'
        ),
        'zakat_now': 'Zakat to pay now',
        'zakat_on_collection': 'Zakat to pay when your receivables are collected',
        'not_computed': 'Not calculated',
        'calculation': 'The calculation',
        'cash': 'Cash: till and bank',
        'stock.sale': 'Stock at selling price on your zakat day',
        'stock.purchase': 'Stock at purchase price',
        'stock.missing': 'Stock, value to choose',
        'receivables': 'Sure receivables',
        'receivables.on_collection': (
            'Counted in the base; their zakat is paid on collection.'
        ),
        'other_asset': 'Other asset: {label}',
        'other_none': 'Other assets: none counted',
        'debts.all': 'All debts',
        'debts.within_12_months': 'Debts due within 12 months',
        'debts.none': 'Debts, none deducted',
        'debts.missing': 'Debts, choice to make',
        'base': 'Base',
        'threshold.silver': 'Threshold, 595 g of silver',
        'threshold.gold': 'Threshold, 85 g of gold',
        'threshold.missing': 'Threshold, reference to choose',
        'threshold_price': 'Price per gram {price}, entered on {date}',
        'threshold_price_undated': 'Price per gram {price}',
        'threshold_price_missing': 'Price per gram not entered',
        'share': 'Your share of the shop',
        'share_text': (
            'Applied to cash, stock, receivables and debts, not to other assets.'
        ),
        'rate.hijri': 'Rate, hijri year',
        'rate.gregorian': 'Rate, solar year',
        'rate.missing': 'Rate, year to choose',
        'zakat_total': 'Estimated zakat',
        'outside': 'Outside the base',
        'outside_hint': 'Kept for the record, not added.',
        'outside_doubtful': 'Doubtful receivable, {label}',
        'outside_doubtful_text': 'Nothing to pay until it is collected.',
        'outside_not_counted_text': 'Added but not counted: your choice.',
        'outside_usage': 'Things you use',
        'outside_usage_text': 'Premises, vehicle, equipment, furniture: not counted.',
        'choices': 'Your opinion choices',
        'choices_hint': 'Where opinions differ, you choose.',
        'choice_missing': 'To choose',
        'choice.nisab_method': 'Reference threshold',
        'choice.calendar': 'Calculation year',
        'choice.stock_valuation': 'Stock value',
        'choice.receivables_mode': 'Sure receivables',
        'choice.debts_mode': 'Debts deducted',
        **_OPTIONS_EN,
        'limits': 'Limits',
        'limit.personal': (
            'Zakat is personal: Mizan adds up what you declare, shop and other '
            'assets. What is not declared is not counted.'
        ),
        'limit.partners': 'Partners: each pays on their own share.',
        'limit.real_estate': (
            'Property: free entry, with no automatic calculation and no opinion '
            'from Mizan.'
        ),
    },
}
