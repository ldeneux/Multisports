"use client";

// Bouton submit ordinaire, sauf qu'il demande confirmation au navigateur
// avant de laisser le formulaire s'envoyer. Le <form action={...}> reste
// défini côté serveur (Server Action) ; ce composant n'intercepte que le
// clic pour l'annuler si l'utilisateur ne confirme pas.
export default function ConfirmSubmitButton({ confirmMessage, className, children }) {
  return (
    <button
      type="submit"
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
