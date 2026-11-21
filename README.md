# Skills para Claude Code

## projeto-por-tarefas-autonomas

Transforma uma ideia ou um projeto existente em spec, tarefas por modelo e tempo, TDD obrigatório e execução orquestrada: a conversa principal planeja, decide e revisa; cada tarefa roda num processo headless do Claude Code com o modelo definido, num worktree próprio.

### Instalar no Claude Code

Para todos os projetos:

```bash
git clone https://github.com/021Antonio/skills-claude.git
mkdir -p ~/.claude/skills
cp -r skills-claude/projeto-por-tarefas-autonomas ~/.claude/skills/
```

Só num projeto: copie a pasta `projeto-por-tarefas-autonomas` para `.claude/skills/` na raiz do projeto.

### Instalar no claude.ai

Compacte a pasta `projeto-por-tarefas-autonomas` em `.zip` e envie em Settings, Capabilities, Skills, Upload skill.

## Dependência: Superpowers

A skill acima usa as skills do plugin Superpowers (TDD, planos, revisão, worktrees). Ele é público e não está copiado aqui. Para instalar, no Claude Code:

```
/plugin install superpowers@claude-plugins-official
```

Fonte: https://github.com/obra/superpowers
