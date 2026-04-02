"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isReservedAdminIdentity } from "@/lib/admin-access";
import { markFirstEntryPending } from "@/lib/first-entry";
import {
  ensureUserInvite,
  ensureUserInviteInSupabase,
  findInviteByCode,
  readInvites,
  syncInvitesFromSupabase,
  writeInvites,
  type InviteRecord,
} from "@/lib/invite-system";
import { ADMIN_EMAIL, ADMIN_USERNAME } from "@/lib/report-inbox";
import { supabase } from "@/lib/supabase/client";
import {
  activateUser,
  ensureProfileForAuthUser,
  findStoredUser,
  isUserBanned,
  readUsers,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  type StoredUser,
  writeUsers,
} from "@/lib/user-registry";

const CONSENT_STORAGE_KEY = "criticable-consent-v1";
const INVITES_STORAGE_KEY = "criticable-invites-v1";
const DEV_ADMIN_PASSWORD = "Criticable2026!";
const DEV_BOOTSTRAP_INVITE_CODE = "PRIMER-ACCESO";
const DEV_LOCAL_ADMIN_EMAIL = "dev-admin@criticable.local";
const DEV_LOCAL_ADMIN_USERNAME = "devcriticable";

const manifestoBlocks = [
  {
    kind: "primary",
    lines: ["ESTO NO ES UNA RED SOCIAL.", "ES UN EXPERIMENTO."],
  },
  {
    kind: "secondary",
    lines: ["Aquí no se juzga quién eres.", "Se juzga lo que proyectas."],
  },
  {
    kind: "warning",
    lines: ["Si entras, aceptas ser percibido."],
  },
  {
    kind: "terminal",
    lines: ["Sin contexto.", "Sin explicación.", "Sin control."],
  },
] as const;

const explanatoryLines = [
  "Otros decidirán qué proyectas.",
  "Tu imagen será interpretada sin contexto.",
  "No controlarás cómo te perciben.",
] as const;

type Stage = "manifesto" | "acceptance" | "signup" | "login";

type ConsentRecord = {
  acceptedAt: string;
  version: number;
};

type SignupForm = {
  confirmPassword: string;
  email: string;
  inviteCode: string;
  password: string;
  username: string;
};

type SignupErrors = Partial<Record<keyof SignupForm, string>> & {
  form?: string;
};

type LoginForm = {
  identity: string;
  password: string;
};

type LoginErrors = Partial<Record<keyof LoginForm, string>> & {
  form?: string;
};

const initialForm: SignupForm = {
  confirmPassword: "",
  email: "",
  inviteCode: "",
  password: "",
  username: "",
};

const initialLoginForm: LoginForm = {
  identity: "",
  password: "",
};

function BrandSignature() {
  return (
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
  );
}

function EntryShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <section className="entry-stage">
      <BrandSignature />
      <div className="entry-stage__inner">{children}</div>
    </section>
  );
}

function EntryLegalNotes() {
  return (
    <div className="entry-legal">
      <p>No se recogen cookies.</p>
      <p>No se permite el acceso a menores de 18 años.</p>
    </div>
  );
}

function ManifestoStage({
  onExit,
  onNext,
}: {
  onExit: () => void;
  onNext: () => void;
}) {
  return (
    <EntryShell>
      <div className="entry-card entry-card--manifesto">
        <div className="manifesto">
          {manifestoBlocks.map((block) => (
            <div
              className={`manifesto-block manifesto-block--${block.kind}`}
              key={block.lines.join("-")}
            >
              {block.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="entry-actions entry-actions--duo">
          <button className="entry-action entry-action--primary" onClick={onNext} type="button">
            ACEPTAR
          </button>
          <button className="entry-action entry-action--secondary" onClick={onExit} type="button">
            SALIR
          </button>
        </div>

        <EntryLegalNotes />
      </div>
    </EntryShell>
  );
}

function AcceptanceStage({
  onAccept,
  onBack,
  onExistingUser,
}: {
  onAccept: () => void;
  onBack: () => void;
  onExistingUser: () => void;
}) {
  return (
    <EntryShell>
      <div className="entry-card entry-card--acceptance">
        <div className="acceptance-copy">
          {explanatoryLines.map((line) => (
            <p className="acceptance-copy__line" key={line}>
              {line}
            </p>
          ))}
        </div>

        <div className="entry-actions entry-actions--stacked">
          <button className="entry-action entry-action--primary" onClick={onAccept} type="button">
            ACEPTAR Y CREAR USUARIO
          </button>
          <button
            className="entry-action entry-action--secondary"
            onClick={onExistingUser}
            type="button"
          >
            YA SOY USUARIO
          </button>
          <button className="entry-action entry-action--secondary" onClick={onBack} type="button">
            VOLVER
          </button>
        </div>

        <EntryLegalNotes />
      </div>
    </EntryShell>
  );
}

function LoginStage({
  errors,
  isSubmitting,
  isRecoveringPassword,
  onBack,
  onChange,
  onRecoverPassword,
  onSubmit,
  showPassword,
  toggleShowPassword,
  values,
}: {
  errors: LoginErrors;
  isSubmitting: boolean;
  isRecoveringPassword: boolean;
  onBack: () => void;
  onChange: (field: keyof LoginForm, value: string) => void;
  onRecoverPassword: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  values: LoginForm;
}) {
  return (
    <EntryShell>
      <div className="entry-card entry-card--login">
        <div className="signup-intro">
          <p className="signup-intro__headline">YA SOY USUARIO.</p>
          <p className="signup-intro__text">
            Entra con tu correo o tu nombre de usuario y tu contraseña.
          </p>
        </div>

        <form className="signup-form" onSubmit={onSubmit}>
          <div className="signup-grid">
            <label className="signup-field">
              <span>CORREO O USUARIO</span>
              <input
                aria-invalid={Boolean(errors.identity)}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => onChange("identity", event.target.value)}
                placeholder="correo o usuario"
                type="text"
                value={values.identity}
              />
              {errors.identity ? <small>{errors.identity}</small> : null}
            </label>

            <label className="signup-field">
              <span>CONTRASEÑA</span>
              <div className="signup-field__control">
                <input
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="current-password"
                  onChange={(event) => onChange("password", event.target.value)}
                  placeholder="Tu contraseña"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                />
                <button
                  className="signup-field__toggle"
                  onClick={toggleShowPassword}
                  type="button"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {errors.password ? <small>{errors.password}</small> : null}
            </label>
          </div>

          {errors.form ? <p className="signup-form__error">{errors.form}</p> : null}
          <div className="signup-form__links">
            <button
              className="signup-form__link"
              disabled={isRecoveringPassword}
              onClick={onRecoverPassword}
              type="button"
            >
              {isRecoveringPassword ? "ENVIANDO..." : "RECUPERAR CONTRASEÑA"}
            </button>
          </div>

          <div className="entry-actions entry-actions--form">
            <button
              className="entry-action entry-action--primary"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "ENTRANDO..." : "ENTRAR"}
            </button>
            <button
              className="entry-action entry-action--secondary"
              onClick={onBack}
              type="button"
            >
              VOLVER
            </button>
          </div>
        </form>
      </div>
    </EntryShell>
  );
}

function SignupStage({
  errors,
  isSubmitting,
  onBack,
  onChange,
  onSubmit,
  values,
}: {
  errors: SignupErrors;
  isSubmitting: boolean;
  onBack: () => void;
  onChange: (field: keyof SignupForm, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  values: SignupForm;
}) {
  return (
    <EntryShell>
      <div className="entry-card entry-card--signup">
        <div className="signup-intro">
          <p className="signup-intro__headline">BIENVENIDO Y GRACIAS.</p>
          <p className="signup-intro__text">
            Si has llegado hasta aquí será porque alguien te ha enviado una
            invitación. Por favor introduce tu correo, el código que te han
            mandado y crea tu usuario.
          </p>
        </div>

        <form className="signup-form" onSubmit={onSubmit}>
          <div className="signup-grid">
            <label className="signup-field">
              <span>CORREO ELECTRÓNICO</span>
              <input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="tu@correo.com"
                type="email"
                value={values.email}
              />
              {errors.email ? <small>{errors.email}</small> : null}
            </label>

            <label className="signup-field">
              <span>CÓDIGO DE INVITACIÓN</span>
              <input
                aria-invalid={Boolean(errors.inviteCode)}
                onChange={(event) => onChange("inviteCode", event.target.value)}
                placeholder="CÓDIGO"
                type="text"
                value={values.inviteCode}
              />
              {errors.inviteCode ? <small>{errors.inviteCode}</small> : null}
            </label>

            <label className="signup-field">
              <span>NOMBRE DE USUARIO ÚNICO</span>
              <input
                aria-invalid={Boolean(errors.username)}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => onChange("username", event.target.value)}
                placeholder="usuario"
                type="text"
                value={values.username}
              />
              {errors.username ? <small>{errors.username}</small> : null}
            </label>

            <label className="signup-field">
              <span>CONTRASEÑA</span>
              <input
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
                onChange={(event) => onChange("password", event.target.value)}
                placeholder="Mínimo 8 caracteres"
                type="password"
                value={values.password}
              />
              {errors.password ? <small>{errors.password}</small> : null}
            </label>

            <label className="signup-field">
              <span>REPITE LA CONTRASEÑA</span>
              <input
                aria-invalid={Boolean(errors.confirmPassword)}
                autoComplete="new-password"
                onChange={(event) =>
                  onChange("confirmPassword", event.target.value)
                }
                placeholder="Escríbela de nuevo"
                type="password"
                value={values.confirmPassword}
              />
              {errors.confirmPassword ? (
                <small>{errors.confirmPassword}</small>
              ) : null}
            </label>
          </div>

          {errors.form ? <p className="signup-form__error">{errors.form}</p> : null}

          <div className="entry-actions entry-actions--form">
            <button
              className="entry-action entry-action--primary"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "CREANDO USUARIO..." : "CREAR USUARIO"}
            </button>
            <button
              className="entry-action entry-action--secondary"
              onClick={onBack}
              type="button"
            >
              VOLVER
            </button>
          </div>
        </form>
      </div>
    </EntryShell>
  );
}

function validateSignup(
  form: SignupForm,
  users: StoredUser[],
  invites: InviteRecord[],
): SignupErrors {
  const errors: SignupErrors = {};
  const normalizedEmail = form.email.trim().toLowerCase();
  const normalizedInviteCode = form.inviteCode.trim().toUpperCase();
  const normalizedUsername = form.username.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernamePattern = /^[a-z0-9._-]{3,24}$/i;

  if (!normalizedEmail || !emailPattern.test(normalizedEmail)) {
    errors.email = "Introduce un correo válido.";
  }

  if (!normalizedInviteCode) {
    errors.inviteCode = "Introduce el código que te han enviado.";
  } else {
    const isBootstrapCode =
      process.env.NODE_ENV !== "production" &&
      normalizedInviteCode === DEV_BOOTSTRAP_INVITE_CODE;
    const matchingInvite = findInviteByCode(normalizedInviteCode, invites);

    if (!matchingInvite && !isBootstrapCode) {
      errors.inviteCode = "Ese código de invitación no existe.";
    } else if (matchingInvite && matchingInvite.usages.length >= matchingInvite.maxUses) {
      errors.inviteCode = "Ese código ya ha alcanzado su límite de usos.";
    }
  }

  if (!normalizedUsername || !usernamePattern.test(normalizedUsername)) {
    errors.username =
      "Usa entre 3 y 24 caracteres con letras, números, punto, guion o guion bajo.";
  } else if (
    users.some((user) => user.username.toLowerCase() === normalizedUsername)
  ) {
    errors.username = "Ese nombre de usuario ya existe.";
  }

  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    errors.email = "Ese correo ya ha sido registrado.";
  }

  if (
    isReservedAdminIdentity({
      email: normalizedEmail,
      username: normalizedUsername,
    })
  ) {
    errors.form = "Esa identidad está reservada por administración.";
  }

  if (form.password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  }

  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function ConsentGate() {
  const router = useRouter();
  const [errors, setErrors] = useState<SignupErrors>({});
  const [form, setForm] = useState<SignupForm>(initialForm);
  const [loginErrors, setLoginErrors] = useState<LoginErrors>({});
  const [loginForm, setLoginForm] = useState<LoginForm>(initialLoginForm);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [stage, setStage] = useState<Stage>("manifesto");

  useEffect(() => {
    let cancelled = false;

    async function seedDevelopmentAdmin() {
      if (process.env.NODE_ENV === "production") {
        if (!cancelled) {
          setIsReady(true);
        }
        return;
      }

      const existingUsers = readUsers();
      const existingInvites = readInvites(INVITES_STORAGE_KEY);
      const adminExists = existingUsers.some(
        (user) =>
          user.email.toLowerCase() === DEV_LOCAL_ADMIN_EMAIL.toLowerCase() ||
          user.username.toLowerCase() === DEV_LOCAL_ADMIN_USERNAME.toLowerCase(),
      );

      if (!adminExists) {
        const passwordHash = await hashPassword(DEV_ADMIN_PASSWORD);

        writeUsers([
          ...existingUsers,
          {
            createdAt: new Date().toISOString(),
            email: DEV_LOCAL_ADMIN_EMAIL,
            inviteCode: "DEV-ADMIN",
            passwordHash,
            username: DEV_LOCAL_ADMIN_USERNAME,
          },
        ]);
      }

      const nextInvites = ensureUserInvite(DEV_LOCAL_ADMIN_USERNAME, existingInvites);

      if (nextInvites.length !== existingInvites.length) {
        writeInvites(INVITES_STORAGE_KEY, nextInvites);
      }

      if (!cancelled) {
        setIsReady(true);
      }
    }

    void seedDevelopmentAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  const exitExperience = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.replace("about:blank");
  };

  const acceptExposure = () => {
    const nextRecord: ConsentRecord = {
      acceptedAt: new Date().toISOString(),
      version: 3,
    };

    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify(nextRecord),
    );
    setLoginErrors({});
    setStage("signup");
  };

  const updateField = (field: keyof SignupForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined,
    }));
  };

  const updateLoginField = (field: keyof LoginForm, value: string) => {
    setLoginForm((current) => ({
      ...current,
      [field]: value,
    }));

    setLoginErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined,
    }));
  };

  const recoverPassword = async () => {
    const identity = loginForm.identity.trim().toLowerCase();
    const users = await syncUsersFromSupabase();
    const user = findStoredUser(identity, users);
    const email = user?.email || (identity.includes("@") ? identity : "");

    if (!email) {
      setLoginErrors({
        identity: "Introduce tu correo o tu usuario para recuperar la contraseña.",
      });
      return;
    }

    setIsRecoveringPassword(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setLoginErrors({
          form: error.message,
        });
        return;
      }

      setLoginErrors({
        form: "Te hemos enviado un correo para cambiar la contraseña.",
      });
    } finally {
      setIsRecoveringPassword(false);
    }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const existingUsers = await syncUsersFromSupabase();
      const existingInvites = await syncInvitesFromSupabase(INVITES_STORAGE_KEY);
      const normalizedInviteCode = form.inviteCode.trim().toUpperCase();
      const isBootstrapCode =
        process.env.NODE_ENV !== "production" &&
        normalizedInviteCode === DEV_BOOTSTRAP_INVITE_CODE;
      const nextErrors = validateSignup(form, existingUsers, existingInvites);

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }

      const email = form.email.trim().toLowerCase();
      const username = form.username.trim();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            username,
          },
        },
      });

      if (signUpError) {
        setErrors({
          form: signUpError.message,
        });
        return;
      }

      if (!signUpData.user || !signUpData.session) {
        setErrors({
          form: "Activa el acceso inmediato por email en Supabase para este MVP.",
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const nextUser: StoredUser = {
        createdAt,
        email,
        inviteCode: normalizedInviteCode,
        passwordHash: "",
        username,
      };

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: signUpData.user.id,
          email,
          invite_code_used: normalizedInviteCode,
          username,
        },
        {
          onConflict: "id",
        },
      );

      if (profileError) {
        setErrors({
          form: profileError.message,
        });
        return;
      }

      await supabase.from("user_settings").upsert(
        {
          age_confirmed: true,
          exposure_consent_accepted: true,
          first_entry_pending: true,
          onboarding_completed: true,
          terms_accepted_at: createdAt,
          user_id: signUpData.user.id,
        },
        {
          onConflict: "user_id",
        },
      );

      const inviteRecord = isBootstrapCode
        ? null
        : findInviteByCode(normalizedInviteCode, existingInvites);

      if (inviteRecord) {
        const { data: inviteRows } = await supabase
          .from("invites")
          .select("id, max_uses")
          .eq("code", inviteRecord.code)
          .limit(1);

        const inviteId = inviteRows?.[0]?.id as string | undefined;

        if (inviteId) {
          await supabase.from("invite_usages").insert({
            invite_id: inviteId,
            used_at: createdAt,
            used_by_user_id: signUpData.user.id,
            used_email: email,
            used_username: username,
          });
        }
      }

      await ensureUserInviteInSupabase(signUpData.user.id, username);
      await syncUsersFromSupabase();
      await syncInvitesFromSupabase(INVITES_STORAGE_KEY);
      activateUser(nextUser);
      markFirstEntryPending(email);

      router.push("/experiment");
    } catch {
      setErrors({
        form: "No se ha podido crear el usuario. Inténtalo de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const identity = loginForm.identity.trim().toLowerCase();
      const password = loginForm.password;
      const nextErrors: LoginErrors = {};

      if (!identity) {
        nextErrors.identity = "Introduce tu correo o tu usuario.";
      }

      if (!password) {
        nextErrors.password = "Introduce tu contraseña.";
      }

      if (Object.keys(nextErrors).length > 0) {
        setLoginErrors(nextErrors);
        return;
      }

      const users = await syncUsersFromSupabase();
      const user = findStoredUser(identity, users);

      const isDevelopmentAdminFallback =
        process.env.NODE_ENV !== "production" &&
        user &&
        (user.email === DEV_LOCAL_ADMIN_EMAIL || user.username === DEV_LOCAL_ADMIN_USERNAME);

      if (isDevelopmentAdminFallback) {
        const passwordHash = await hashPassword(password);

        if (user.passwordHash !== passwordHash) {
          setLoginErrors({
            form: "La contraseña no es correcta.",
          });
          return;
        }

        activateUser({
          ...user,
          isAdmin: true,
        });

        if (!window.localStorage.getItem(CONSENT_STORAGE_KEY)) {
          window.localStorage.setItem(
            CONSENT_STORAGE_KEY,
            JSON.stringify({
              acceptedAt: new Date().toISOString(),
              version: 3,
            } satisfies ConsentRecord),
          );
        }

        router.push("/experiment");
        return;
      }

      if (!user && !identity.includes("@")) {
        setLoginErrors({
          form: "No existe un usuario con esos datos.",
        });
        return;
      }

      if (user && isUserBanned(user)) {
        setLoginErrors({
          form: "Este usuario ha sido bloqueado por administración.",
        });
        return;
      }

      const loginEmail = user?.email?.includes("@") ? user.email : identity;
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (signInError) {
        setLoginErrors({
          form:
            signInError.message === "Invalid login credentials"
              ? "Los datos de acceso no son correctos."
              : signInError.message,
        });
        return;
      }

      const authUser = signInData.user;

      if (authUser?.id) {
        await ensureProfileForAuthUser({
          email: authUser.email,
          id: authUser.id,
          usernameHint:
            typeof authUser.user_metadata?.username === "string"
              ? authUser.user_metadata.username
              : authUser.email?.split("@")[0],
        });

        const refreshedActiveUser = await syncActiveUserFromSupabase();

        if (refreshedActiveUser?.username) {
          await ensureUserInviteInSupabase(authUser.id, refreshedActiveUser.username);
        }
      }

      const syncedActiveUser = await syncActiveUserFromSupabase();
      await syncUsersFromSupabase();
      await syncInvitesFromSupabase(INVITES_STORAGE_KEY);

      if (!syncedActiveUser) {
        setLoginErrors({
          form: "No se ha podido abrir la sesión.",
        });
        return;
      }

      if (!window.localStorage.getItem(CONSENT_STORAGE_KEY)) {
        window.localStorage.setItem(
          CONSENT_STORAGE_KEY,
          JSON.stringify({
            acceptedAt: new Date().toISOString(),
            version: 3,
          } satisfies ConsentRecord),
        );
      }

      router.push("/experiment");
    } catch (error) {
      setLoginErrors({
        form:
          error instanceof Error
            ? `No se ha podido abrir la sesión: ${error.message}`
            : "No se ha podido abrir la sesión.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return <main className="screen screen--loading" />;
  }

  return (
    <main className="entry">
      {stage === "manifesto" ? (
        <ManifestoStage onExit={exitExperience} onNext={() => setStage("acceptance")} />
      ) : null}

      {stage === "acceptance" ? (
        <AcceptanceStage
          onAccept={acceptExposure}
          onBack={() => setStage("manifesto")}
          onExistingUser={() => setStage("login")}
        />
      ) : null}

      {stage === "signup" ? (
        <SignupStage
          errors={errors}
          isSubmitting={isSubmitting}
          onBack={() => setStage("acceptance")}
          onChange={updateField}
          onSubmit={createUser}
          values={form}
        />
      ) : null}

      {stage === "login" ? (
        <LoginStage
          errors={loginErrors}
          isRecoveringPassword={isRecoveringPassword}
          isSubmitting={isSubmitting}
          onBack={() => setStage("acceptance")}
          onChange={updateLoginField}
          onRecoverPassword={recoverPassword}
          onSubmit={loginUser}
          showPassword={showLoginPassword}
          toggleShowPassword={() => setShowLoginPassword((current) => !current)}
          values={loginForm}
        />
      ) : null}
    </main>
  );
}
