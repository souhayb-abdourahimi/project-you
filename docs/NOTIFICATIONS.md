# Notifications

Statut : à construire (M-18). Principes :

- Catégories réglables une à une : entraînement, repas, hydratation, motivation, progression, pesée, courses, calendrier, promotions (table `notification_preferences`).
- Pas de spam : plafond quotidien global (3 par défaut), heures calmes, aucune notification de promotion sans information réelle et sourcée.
- Ton jamais culpabilisant ; messages de motivation construits à partir de la réponse « Pourquoi as-tu commencé ? ».
- Permission demandée au moment où l'utilisateur active une catégorie, jamais au premier lancement.
- Web : notifications du navigateur si autorisées, sinon rappels visibles dans l'app.
