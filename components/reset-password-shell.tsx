"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function ResetPasswordShell() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function hydrateRecovery() {
      await supabase.auth.getSession();

      if (mounted) {
        setIsReady(true);
      }
    }

    void hydrateRecovery();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setIsSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return <main className="screen screen--loading" />;
  }

  return (
    <main className="entry">
      <section className="entry-stage">
        <div className="entry-brand" aria-label="criticable">
          <Image
            alt="criticable"
            className="entry-brand__image"
            height={60}
            priority
            src="/criticable-logo.png"
            width={360}
          />
        </div>

        <div className="entry-stage__inner">
          <div className="entry-card entry-card--login">
            <div className="signup-intro">
              <p className="signup-intro__headline">NUEVA CONTRASEÑA.</p>
              <p className="signup-intro__text">
                Define una contraseña nueva para volver a entrar.
              </p>
            </div>

            <form className="signup-form" onSubmit={handleSubmit}>
              <div className="signup-grid">
                <label className="signup-field">
                  <span>NUEVA CONTRASEÑA</span>
                  <div className="signup-field__control">
                    <input
                      autoComplete="new-password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      className="signup-field__toggle"
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </label>

                <label className="signup-field">
                  <span>REPITE LA CONTRASEÑA</span>
                  <input
                    autoComplete="new-password"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Escríbela de nuevo"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                  />
                </label>
              </div>

              {error ? <p className="signup-form__error">{error}</p> : null}
              {isSuccess ? (
                <p className="report-form__success">
                  Contraseña actualizada. Ya puedes volver a entrar.
                </p>
              ) : null}

              <div className="entry-actions entry-actions--form">
                <button
                  className="entry-action entry-action--primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "GUARDANDO..." : "GUARDAR CONTRASEÑA"}
                </button>
                <Link className="entry-action entry-action--secondary entry-action--link" href="/">
                  VOLVER
                </Link>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
