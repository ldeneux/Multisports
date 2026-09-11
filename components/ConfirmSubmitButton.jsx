"use client";

// Bouton submit ordinaire, sauf qu'il demande confirmation au navigateur
// avant de laisser le formulaire s'envoyer. Le <form action={...}> reste
// défini côté serveur (Server Action) ; ce composant n'intercepte que le
// clic pour l'annuler si l'utilisateur ne confirme pas. `formAction` est
// optionnel : utile quand ce bouton doit déclencher une action DIFFÉRENTE
// de celle par défaut du formulaire (ex. un bouton "Supprimer" dans un
// formulaire dont l'action normale est "Enregistrer").
export default function ConfirmSubmitButton({ confirmMessage, className, children, formAction }) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
