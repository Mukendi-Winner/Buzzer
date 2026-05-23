import './ConfirmationModal.css'

function ConfirmationModal({
  open,
  title = 'Confirmation',
  message,
  confirmLabel = 'Oui',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open) {
    return null
  }

  return (
    <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title">
      <div className="confirmation-modal__backdrop" onClick={busy ? undefined : onCancel} />
      <div className="confirmation-modal__card">
        <h2 id="confirmation-modal-title" className="confirmation-modal__title">
          {title}
        </h2>
        <p className="confirmation-modal__message">{message}</p>
        <div className="confirmation-modal__actions">
          <button
            type="button"
            className="confirmation-modal__button confirmation-modal__button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirmation-modal__button confirmation-modal__button--primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
