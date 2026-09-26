const request = require('supertest');
const ejs = require('ejs');
const path = require('path');
const app = require('../app');

describe('TAREFA 1, 2 & 3 — Landing Page, Modernização e Tema Claro/Escuro', () => {

  describe('TAREFA 1 — GET / (Landing Page Pública)', () => {
    it('deve retornar status 200 e renderizar a landing page para visitante deslogado', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);

      // Header fixo com marca, botões e toggle de tema
      expect(res.text).toContain('DocFlow');
      expect(res.text).toContain('href="/login"');
      expect(res.text).toContain('href="/empresas/cadastro"');
      expect(res.text).toContain('Cadastrar empresa');
      expect(res.text).toContain('theme-toggle-btn');

      // Hero
      expect(res.text).toContain('Organize a coleta de documentos dos seus clientes');
      expect(res.text).toContain('WhatsApp');
      expect(res.text).toContain('Cadastre sua empresa grátis');

      // Como funciona (4 passos em cards)
      expect(res.text).toContain('Como funciona o DocFlow');
      expect(res.text).toContain('Criar processo');
      expect(res.text).toContain('Enviar link');
      expect(res.text).toContain('Cliente envia documentos');
      expect(res.text).toContain('Concluir');

      // Antes x Depois
      expect(res.text).toContain('Antes x Depois');
      expect(res.text).toContain('Antes do DocFlow');
      expect(res.text).toContain('Depois do DocFlow');

      // Segurança com destaque visual
      expect(res.text).toContain('Segurança Avançada');
      expect(res.text).toContain('Criptografia');
      expect(res.text).toContain('Senhas com Hash');

      // Planos (Grátis e Pro) com botão Começar agora
      expect(res.text).toContain('PLANO GRÁTIS');
      expect(res.text).toContain('PLANO PRO');
      expect(res.text).toContain('Começar agora');

      // Footer
      expect(res.text).toContain('Plataforma Segura de Coleta de Documentos');
    });

    it('não deve alterar o comportamento de /login para visitantes', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Entrar');
      expect(res.text).toContain('E-mail Corporativo');
    });

    it('deve redirecionar para /processos se o usuário já tiver sessão ativa', async () => {
      const express = require('express');
      const testApp = express();
      testApp.set('view engine', 'ejs');
      testApp.set('views', path.join(__dirname, '../views'));

      const homeController = require('../controllers/homeController');
      testApp.get('/', (req, res) => {
        req.session = { empresa: { id: 1, razaoSocial: 'Empresa Teste', plano: 'PRO' } };
        homeController.renderHome(req, res);
      });

      const res = await request(testApp).get('/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/processos');
    });
  });

  describe('TAREFA 2 & 3 — Estilização, Theme.css e Alternância de Tema', () => {
    it('deve carregar o arquivo public/css/theme.css com status 200 e variáveis de tema', async () => {
      const res = await request(app).get('/css/theme.css');
      expect(res.status).toBe(200);
      expect(res.text).toContain('[data-theme="light"]');
      expect(res.text).toContain('[data-theme="dark"]');
      expect(res.text).toContain('--df-primary');
      expect(res.text).toContain('--df-bg-body');
      expect(res.text).toContain('--df-warning-bg');
      expect(res.text).toContain('--df-success-bg');
    });

    it('deve carregar o arquivo public/js/theme.js com o manipulador de localStorage e prefers-color-scheme', async () => {
      const res = await request(app).get('/js/theme.js');
      expect(res.status).toBe(200);
      expect(res.text).toContain('prefers-color-scheme');
      expect(res.text).toContain('localStorage');
      expect(res.text).toContain('theme-toggle-btn');
    });

    it('a tela de login deve incluir o botão de toggle de tema e o script theme.js', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('theme-toggle-btn');
      expect(res.text).toContain('/css/theme.css');
      expect(res.text).toContain('/js/theme.js');
    });

    it('o layout da navbar interna deve incluir o botão de toggle de tema', async () => {
      const navbarPath = path.join(__dirname, '../views/partials/navbar.ejs');
      const html = await ejs.renderFile(navbarPath, {
        empresa: { id: 1, razaoSocial: 'Empresa Teste', plano: 'GRATIS' },
        currentPath: '/processos',
      });

      expect(html).toContain('theme-toggle-btn');
      expect(html).toContain('bi-moon-stars');
      expect(html).toContain('bi-sun');
    });
  });

  describe('Link de Histórico na Navbar Interna (Plano Pro)', () => {
    const navbarPath = path.join(__dirname, '../views/partials/navbar.ejs');

    it('NÃO deve exibir o link Histórico quando o plano for GRATIS', async () => {
      const html = await ejs.renderFile(navbarPath, {
        empresa: { id: 1, razaoSocial: 'Empresa Grátis', plano: 'GRATIS' },
        currentPath: '/processos',
      });

      expect(html).not.toContain('Histórico');
      expect(html).toContain('Processos');
      expect(html).toContain('Clientes');
      expect(html).toContain('Minha Empresa');
      expect(html).toContain('PLANO GRÁTIS');
    });

    it('DEVE exibir o link Histórico apontando para a rota de histórico quando o plano for PRO', async () => {
      const html = await ejs.renderFile(navbarPath, {
        empresa: { id: 2, razaoSocial: 'Empresa Pro', plano: 'PRO' },
        currentPath: '/processos',
      });

      expect(html).toContain('Histórico');
      expect(html).toContain('/clientes/historico');
      expect(html).toContain('PLANO PRO');
    });

    it('DEVE apontar para o cliente específico quando cliente.id estiver no contexto da view', async () => {
      const html = await ejs.renderFile(navbarPath, {
        empresa: { id: 2, razaoSocial: 'Empresa Pro', plano: 'PRO' },
        cliente: { id: 42, nome: 'Cliente VIP' },
        currentPath: '/clientes/42/editar',
      });

      expect(html).toContain('Histórico');
      expect(html).toContain('/clientes/42/historico');
    });
  });
});
