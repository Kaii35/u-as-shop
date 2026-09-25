import { useState } from 'react';
import { KeyRound, Pencil, Power, ShieldCheck, UserPlus, Users } from 'lucide-react';
import {
  Badge,
  ErrorState,
  FormError,
  Modal,
  Panel,
  Skeleton,
  TableWrap,
  Td,
  Th,
  formatDateTime,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { useAction, useResource } from '../../lib/useResource';
import type { AdminUser, UserRole } from '../../lib/admin-types';

/**
 * Equipo.
 *
 * Quien de verdad protege esto es la API: `requireAdmin` en cada ruta de
 * `/api/admin/users`. Que esta sección solo se pinte para un ADMIN es
 * comodidad —no enseñar botones que van a responder 403—, nunca seguridad:
 * cualquiera puede saltarse la interfaz desde la consola del navegador.
 */

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administradora',
  STAFF: 'Equipo',
};

const ROLE_HELP: Record<UserRole, string> = {
  ADMIN: 'Ve y cambia todo, incluido el equipo y los ajustes.',
  STAFF: 'Atiende pedidos, productos e inventario. No toca el equipo.',
};

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'password'; user: AdminUser }
  | null;

interface UserPatch {
  name?: string;
  role?: UserRole;
  active?: boolean;
  password?: string;
}

export default function SettingsTeam({ currentUserId }: { currentUserId: string }) {
  const users = useResource<AdminUser[]>(
    (signal) => api.get<AdminUser[]>('/api/admin/users', undefined, signal),
    [],
  );

  const [dialog, setDialog] = useState<Dialog>(null);

  // Los datos viajan como argumento y no por cierre: `useAction` memoriza la
  // función de la primera renderización y leería el formulario vacío.
  const createUser = useAction(
    async (body: { email: string; name: string; password: string; role: UserRole }) =>
      api.post<AdminUser>('/api/admin/users', body),
  );
  const patchUser = useAction(async (args: { id: string; patch: UserPatch }) =>
    api.patch<AdminUser>(`/api/admin/users/${args.id}`, args.patch),
  );

  const toggleActive = async (user: AdminUser) => {
    const result = await patchUser.run({ id: user.id, patch: { active: !user.active } });
    if (result) users.reload();
  };

  return (
    <>
      <Panel
        className="mt-4"
        title="Equipo"
        description="Quién puede entrar al panel y hasta dónde llega."
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'create' })}>
            <UserPlus size={15} strokeWidth={2} />
            Añadir persona
          </Button>
        }
      >
        {users.first ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : users.error ? (
          <ErrorState message={users.error} onRetry={users.reload} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Último ingreso</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id}>
                    <Td>
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        {user.name}
                        {isSelf && <Badge tone="clay">Tú</Badge>}
                      </p>
                      <p className="text-cap text-mist">{user.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={user.role === 'ADMIN' ? 'info' : 'neutral'}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={user.active === false ? 'neutral' : 'ok'}>
                        {user.active === false ? 'Desactivada' : 'Activa'}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-ash">
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca ha entrado'}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: 'edit', user })}
                          aria-label={`Editar a ${user.name}`}
                          title="Editar nombre y rol"
                          className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
                        >
                          <Pencil size={15} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: 'password', user })}
                          aria-label={`Cambiar la contraseña de ${user.name}`}
                          title="Cambiar contraseña"
                          className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
                        >
                          <KeyRound size={15} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          disabled={isSelf || patchUser.pending}
                          onClick={() => void toggleActive(user)}
                          aria-label={
                            user.active === false
                              ? `Activar a ${user.name}`
                              : `Desactivar a ${user.name}`
                          }
                          title={
                            isSelf
                              ? 'No puedes desactivar tu propia cuenta'
                              : user.active === false
                                ? 'Activar'
                                : 'Desactivar'
                          }
                          className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-mist"
                        >
                          <Power size={15} strokeWidth={2} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          <p className="flex items-start gap-1.5 text-cap text-mist">
            <ShieldCheck size={13} strokeWidth={2} className="mt-px shrink-0" />
            Sobre tu propia cuenta no puedes quitarte el rol de administradora ni desactivarte: si
            lo hicieras, te quedarías fuera del panel y nadie podría volver a abrirte la puerta.
          </p>
          <FormError message={patchUser.error} />
        </div>
      </Panel>

      {dialog?.kind === 'create' && (
        <CreateUserDialog
          pending={createUser.pending}
          error={createUser.error}
          onClose={() => {
            createUser.clearError();
            setDialog(null);
          }}
          onSubmit={async (body) => {
            const result = await createUser.run(body);
            if (result) {
              setDialog(null);
              users.reload();
            }
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          pending={patchUser.pending}
          error={patchUser.error}
          onClose={() => {
            patchUser.clearError();
            setDialog(null);
          }}
          onSubmit={async (patch) => {
            const result = await patchUser.run({ id: dialog.user.id, patch });
            if (result) {
              setDialog(null);
              users.reload();
            }
          }}
        />
      )}

      {dialog?.kind === 'password' && (
        <PasswordDialog
          user={dialog.user}
          pending={patchUser.pending}
          error={patchUser.error}
          onClose={() => {
            patchUser.clearError();
            setDialog(null);
          }}
          onSubmit={async (password) => {
            const result = await patchUser.run({ id: dialog.user.id, patch: { password } });
            if (result) setDialog(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Select
        label="Rol"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as UserRole)}
      >
        <option value="STAFF">{ROLE_LABEL.STAFF}</option>
        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
      </Select>
      <p className="mt-1.5 text-cap text-mist">{ROLE_HELP[value]}</p>
    </div>
  );
}

function CreateUserDialog({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: {
    email: string;
    name: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = () => {
    if (name.trim().length < 2) return setInvalid('El nombre es obligatorio.');
    if (email.trim() === '') return setInvalid('Falta el correo.');
    if (password.length < 8) return setInvalid('La contraseña necesita al menos 8 caracteres.');
    setInvalid(null);
    void onSubmit({ email: email.trim(), name: name.trim(), password, role });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Añadir persona al equipo"
      description="Podrá entrar al panel con este correo y esta contraseña."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={pending} onClick={submit}>
            Crear cuenta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Correo"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Contraseña"
          hint="mínimo 8 caracteres"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <RoleSelect value={role} onChange={setRole} />
        <FormError message={invalid ?? error} />
      </div>
    </Modal>
  );
}

function EditUserDialog({
  user,
  isSelf,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  isSelf: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (patch: UserPatch) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = () => {
    if (name.trim().length < 2) return setInvalid('El nombre es obligatorio.');
    setInvalid(null);
    void onSubmit({
      ...(name.trim() === user.name ? {} : { name: name.trim() }),
      // Sobre la propia cuenta el rol ni se manda: el control está apagado y
      // la API respondería 400 de todos modos.
      ...(isSelf || role === user.role ? {} : { role }),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Editar a ${user.name}`}
      description={user.email}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={pending} onClick={submit}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
        {isSelf && (
          <p className="text-cap text-mist">
            Es tu propia cuenta: el rol está bloqueado a propósito. Si te lo quitaras, perderías el
            acceso a esta sección y nadie podría devolvértelo.
          </p>
        )}
        <FormError message={invalid ?? error} />
      </div>
    </Modal>
  );
}

function PasswordDialog({
  user,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = () => {
    if (password.length < 8) return setInvalid('La contraseña necesita al menos 8 caracteres.');
    setInvalid(null);
    void onSubmit(password);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Cambiar contraseña"
      description={`${user.name} · ${user.email}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={pending} onClick={submit}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Nueva contraseña"
          hint="mínimo 8 caracteres"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="flex items-start gap-1.5 text-cap text-mist">
          <Users size={13} strokeWidth={2} className="mt-px shrink-0" />
          Anótala y entrégasela en persona: el panel no la manda por correo y no hay forma de
          volver a verla.
        </p>
        <FormError message={invalid ?? error} />
      </div>
    </Modal>
  );
}
