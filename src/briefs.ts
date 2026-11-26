// 추천 카드의 '1분 설명' 자료: 대본(후킹 멘트) 다음에 이어서 1분 정도 풀어 말할 흐름과 공식 자료 링크.
// 흐름은 항상 공감 → 문제 → 해결 → 다음 단계 순서. 링크는 모두 실제로 열리는 Red Hat 공식 페이지만 넣는다.

export interface BriefLink {
  label: string;
  url: string;
}

export interface Brief {
  points: { label: '공감' | '문제' | '해결' | '다음 단계'; text: string }[];
  links: BriefLink[];
}

const L = {
  rhel7: { label: 'RHEL 7 유지보수 종료 안내', url: 'https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/rhel-7-end-of-maintenance' },
  els: { label: 'RHEL ELS 애드온 (고객 포털)', url: 'https://access.redhat.com/products/red-hat-enterprise-linux/els' },
  lifecycle: { label: 'RHEL 라이프사이클 정책', url: 'https://access.redhat.com/support/policy/updates/errata' },
  satellite: { label: 'Red Hat Satellite', url: 'https://www.redhat.com/en/technologies/management/satellite' },
  insights: { label: 'Red Hat Insights', url: 'https://www.redhat.com/en/technologies/management/insights' },
  ansible: { label: 'Ansible Automation Platform', url: 'https://www.redhat.com/en/technologies/management/ansible' },
  openshift: { label: 'Red Hat OpenShift', url: 'https://www.redhat.com/en/technologies/cloud-computing/openshift' },
  virt: { label: 'OpenShift Virtualization', url: 'https://www.redhat.com/en/technologies/cloud-computing/openshift/virtualization' },
  howToBuy: { label: 'RHEL 구독 구매 안내', url: 'https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/how-to-buy' },
  sla: { label: '지원 등급별 응답 시간 (SLA)', url: 'https://access.redhat.com/support/offerings/production/sla' },
  scope: { label: '지원 범위 상세', url: 'https://access.redhat.com/support/offerings/production/scope_moredetail' },
  vdc: { label: 'RHEL for Virtual Datacenters', url: 'https://www.redhat.com/en/store/red-hat-enterprise-linux-virtual-datacenters' },
  centos: { label: 'CentOS에서 RHEL로 전환', url: 'https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/centos-migration' },
  rhel: { label: 'Red Hat Enterprise Linux', url: 'https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux' },
  trial: { label: 'RHEL 무료 체험', url: 'https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/server/trial' },
  tam: { label: 'Technical Account Manager', url: 'https://www.redhat.com/en/services/support/technical-account-management' }
} satisfies Record<string, BriefLink>;

export const BRIEFS: Record<string, Brief> = {
  'rec-netnew-rhel': {
    points: [
      { label: '공감', text: '무상 리눅스로도 지금까지 잘 운영해 오셨다면, 굳이 구독 비용을 낼 이유를 못 느끼시는 게 당연합니다.' },
      { label: '문제', text: 'CentOS 7은 2024년 6월 30일에 지원이 끝났고, 무상 배포판은 장애가 나도 책임지고 지원해 줄 곳이 없습니다. 보안 감사나 업무 앱 벤더의 지원 조건(인증 OS)에서 걸리는 경우도 많습니다.' },
      { label: '해결', text: 'RHEL은 보안 패치, 장애 지원, 주요 업무 소프트웨어 인증을 함께 제공합니다. CentOS 계열은 같은 계열이라 Convert2RHEL로 재설치 없이 전환할 수 있고, 업무 영향이 큰 서버부터 단계적으로 바꿀 수 있습니다. 서버 설정이나 패치를 손으로 하고 있다면 Smart Management(Satellite)를 함께 넣어 전체 서버의 구성·패치를 한 곳에서 일괄 관리하도록 같이 제안하세요.' },
      { label: '다음 단계', text: '서버 목록과 OS 버전, 벤더 인증이 필요한 업무 시스템을 여쭤보고, 우선 전환 대상과 무료 체험(PoC) 범위를 제안하세요.' }
    ],
    links: [L.centos, L.trial, L.satellite]
  },
  'rec-netnew-other': {
    points: [
      { label: '공감', text: 'Ubuntu나 SUSE로 이미 안정적으로 운영 중이시면, 잘 돌아가는 OS를 바꿀 이유부터 분명해야 한다는 게 당연합니다.' },
      { label: '문제', text: '배포판이 섞여 있으면 배포판마다 지원 주기와 패치 방식이 달라 운영 표준과 보안 점검이 이원화됩니다. 업무 소프트웨어 벤더가 지원하는 OS 조건을 맞추는 것도 시스템마다 따로 확인해야 합니다.' },
      { label: '해결', text: 'RHEL은 메이저 버전마다 10년 라이프사이클을 제공하고, 주요 업무 소프트웨어와 하드웨어 인증 생태계가 넓습니다. 지금 서버를 한 번에 바꾸는 게 아니라, 신규 구축이나 교체 주기가 오는 서버부터 RHEL로 표준화하는 방식이라 부담이 적습니다. 서버 설정이나 패치를 손으로 하고 있다면 Smart Management(Satellite)를 함께 넣어 전체 서버의 구성·패치를 한 곳에서 일괄 관리하도록 같이 제안하세요.' },
      { label: '다음 단계', text: '앞으로 1년 안에 새로 구축하거나 교체할 시스템, 벤더 인증이 필요한 업무 시스템을 여쭤보고, 그 범위로 무료 체험(PoC)을 제안하세요.' }
    ],
    links: [L.rhel, L.trial, L.satellite]
  },
  'rec-els': {
    points: [
      { label: '공감', text: '업무 시스템이 RHEL 7 위에서 안정적으로 돌고 있으면, 잘 돌아가는 서버를 굳이 건드리기 부담스러운 게 당연합니다.' },
      { label: '문제', text: 'RHEL 7은 2024년 6월 30일에 유지보수 지원이 끝나서, 그 뒤로는 보안 패치가 기본 구독으로 나오지 않습니다. 보안 감사에서 지원 종료 OS로 지적받기 쉬운 상태입니다.' },
      { label: '해결', text: 'ELS 애드온을 더하면 이전이 끝날 때까지 중요 보안 패치와 지원을 계속 받을 수 있습니다. 서둘러 옮기지 않고 RHEL 9·10 이전 일정을 계획대로 가져갈 시간을 버는 장치입니다.' },
      { label: '다음 단계', text: 'RHEL 7 서버 목록과 버전(7.9 여부)을 받아서, ELS 대상 수량과 이전 순서를 한 장으로 정리해 드리겠다고 제안하세요.' }
    ],
    links: [L.rhel7, L.els, L.lifecycle]
  },
  'rec-smart-mgmt': {
    points: [
      { label: '공감', text: '서버가 늘수록 누가 어떤 서버에 어떤 패치를 했는지 추적하는 일 자체가 업무가 됩니다. 감사 시즌마다 엑셀로 증빙을 모으는 팀이 많습니다.' },
      { label: '문제', text: '담당자별 스크립트나 수작업으로 패치하면 누락이 생기기 쉽고, 감사 때 "모든 서버에 적용했다"를 증명하기 어렵습니다.' },
      { label: '해결', text: 'Smart Management(Satellite)는 RHEL 서버 전체의 패치 대상 확인, 일괄 적용, 적용 이력과 보고서를 한 곳에서 처리합니다. 기존 RHEL 구독에 더하는 방식이라 새 플랫폼 도입 부담이 적습니다.' },
      { label: '다음 단계', text: '최근 감사에서 패치 증빙에 걸린 시간과 서버 수를 여쭤보고, 그 기준으로 데모 일정을 잡자고 제안하세요.' }
    ],
    links: [L.satellite, L.insights]
  },
  'rec-satellite-expand': {
    points: [
      { label: '공감', text: '이미 Satellite로 패치를 관리하고 계시니 기본은 잘 갖춰져 있습니다.' },
      { label: '문제', text: '그런데도 감사 대응에 수작업이 남는다면 보통 컴플라이언스 정책 점검이나 취약점 분석까지는 연결되지 않은 경우입니다.' },
      { label: '해결', text: 'Satellite의 컴플라이언스(OpenSCAP) 점검과 Insights 취약점·권고 분석을 함께 쓰면, 어떤 서버가 정책을 어기는지와 무엇을 고쳐야 하는지가 보고서로 나옵니다. 추가 플랫폼 없이 지금 쓰는 도구의 활용 범위를 넓히는 방식입니다.' },
      { label: '다음 단계', text: '현재 Satellite에 등록된 서버 범위와 쓰고 있는 기능을 같이 점검하는 짧은 세션을 제안하세요.' }
    ],
    links: [L.satellite, L.insights]
  },
  'rec-aap': {
    points: [
      { label: '공감', text: '반복 작업을 스크립트나 손으로 처리하는 건 대부분의 운영팀이 겪는 일이고, 사람이 꼼꼼하면 당장은 문제없이 돌아갑니다.' },
      { label: '문제', text: '작업 방식이 사람마다 달라서 담당자가 바뀌면 노하우가 사라지고, 서버가 늘거나 업그레이드처럼 큰 작업이 오면 시간이 그대로 늘어납니다.' },
      { label: '해결', text: 'Ansible Automation Platform은 자주 하는 작업을 표준 절차(플레이북)로 만들어 누가 실행해도 같은 결과가 나오게 합니다. 실행 이력, 권한 관리, 기술 지원이 포함돼 팀 단위로 운영할 수 있습니다.' },
      { label: '다음 단계', text: '가장 자주 하는 작업 한두 가지를 골라 자동화했을 때 줄어드는 시간을 같이 계산해 보자고 제안하세요.' }
    ],
    links: [L.ansible]
  },
  'rec-openshift': {
    points: [
      { label: '공감', text: '컨테이너로 가는 방향은 맞는데, 쿠버네티스를 직접 운영하면 생각보다 손이 많이 간다는 이야기를 자주 듣습니다.' },
      { label: '문제', text: '버전 업그레이드, 보안 패치, 모니터링, 개발자 권한 관리를 모두 팀이 직접 챙겨야 하고, 문제가 생기면 기댈 곳이 없습니다.' },
      { label: '해결', text: 'OpenShift는 쿠버네티스에 운영에 필요한 기능과 Red Hat 지원을 묶은 플랫폼입니다. 온프레미스와 클라우드를 같은 방식으로 운영할 수 있어 환경이 늘어도 운영 표준이 유지됩니다.' },
      { label: '다음 단계', text: '현재 클러스터 수와 운영 인력, 가장 부담되는 작업을 여쭤보고 아키텍처 워크숍을 제안하세요.' }
    ],
    links: [L.openshift]
  },
  'rec-openshift-virt': {
    points: [
      { label: '공감', text: '가상화 비용이 갑자기 오르면 대안을 찾는 건 자연스러운데, 수백 대 VM을 옮기는 일이라 쉽게 결정하기 어렵습니다.' },
      { label: '문제', text: '가장 큰 걱정은 기존 VM을 그대로 옮길 수 있는지, 그리고 운영팀이 새 도구를 다시 배워야 하는지입니다.' },
      { label: '해결', text: 'OpenShift Virtualization은 VM을 그대로 옮겨 컨테이너와 같은 플랫폼에서 운영하게 해 줍니다. 한 번에 다 옮기지 않고 일부 워크로드부터 단계적으로 이전할 수 있습니다.' },
      { label: '다음 단계', text: '현재 VM 수, 가상화 계약 만료 시점, 먼저 옮겨 볼 만한 워크로드를 여쭤보고 이전 범위 산정을 제안하세요.' }
    ],
    links: [L.virt, L.openshift]
  },
  'rec-true-up': {
    points: [
      { label: '공감', text: '서버는 프로젝트마다 늘었다 줄었다 해서 구독 수량을 실제와 딱 맞게 유지하기가 쉽지 않습니다.' },
      { label: '문제', text: '실제 서버가 구독보다 많으면 지원 대상에서 빠진 서버가 생기고, 감사나 장애 때 문제가 될 수 있습니다.' },
      { label: '해결', text: '갱신 시점에 실제 사용량을 확인해 구독 수량을 맞추면, 모든 서버가 패치와 지원을 받는 상태로 정리됩니다. 갱신 견적에 함께 넣으면 따로 구매 절차를 밟을 필요도 없습니다.' },
      { label: '다음 단계', text: '서버 목록이나 Satellite·구독 관리 화면 기준 사용량을 받아 갱신 견적에 반영하자고 제안하세요.' }
    ],
    links: [L.howToBuy]
  },
  'rec-premium': {
    points: [
      { label: '공감', text: '핵심 시스템은 장애가 나면 업무가 멈추니, 장애 대응 속도가 무엇보다 중요합니다.' },
      { label: '문제', text: 'Standard 지원은 업무 시간 기준이라 야간·주말 장애에는 대응이 늦어질 수 있습니다.' },
      { label: '해결', text: 'Premium 지원은 심각한 장애에 24시간 365일 대응합니다. 모든 서버가 아니라 핵심 시스템 서버만 Premium으로 올리는 방식도 가능해 비용을 조절할 수 있습니다.' },
      { label: '다음 단계', text: '핵심 시스템이 몇 대인지, 최근 야간·주말 장애가 있었는지 여쭤보고 해당 서버만 Premium으로 바꾼 견적을 제안하세요.' }
    ],
    links: [L.sla, L.scope]
  },
  'rec-vdc': {
    points: [
      { label: '공감', text: 'RHEL VM이 많아질수록 VM마다 구독을 세는 관리가 번거로워집니다.' },
      { label: '문제', text: '호스트당 VM이 많은 환경에서는 VM 단위 구독이 비용과 관리 양쪽에서 비효율적일 수 있습니다.' },
      { label: '해결', text: 'RHEL for Virtual Datacenters는 물리 호스트 기준으로 구독해서 그 호스트 위 RHEL VM을 수량 제한 없이 쓸 수 있습니다. VM을 늘리거나 옮겨도 구독을 다시 셀 필요가 없습니다.' },
      { label: '다음 단계', text: '호스트 수와 호스트당 RHEL VM 수를 받아서 현재 방식과 VDC 방식 비용을 비교해 드리겠다고 제안하세요.' }
    ],
    links: [L.vdc]
  },
  'rec-tam': {
    points: [
      { label: '공감', text: '지원 요청할 때마다 우리 환경을 처음부터 다시 설명하는 게 가장 답답하다는 말을 자주 듣습니다.' },
      { label: '문제', text: '케이스마다 다른 엔지니어가 받으면 환경을 파악하는 데 시간이 걸리고, 장애를 미리 막는 조언은 받기 어렵습니다.' },
      { label: '해결', text: 'TAM은 고객 환경을 아는 전담 엔지니어로, 케이스 에스컬레이션과 정기 점검, 업그레이드 계획 같은 선제적 조언을 맡습니다.' },
      { label: '다음 단계', text: '최근 지원 케이스에서 아쉬웠던 사례를 여쭤보고 TAM 소개 미팅을 제안하세요.' }
    ],
    links: [L.tam, L.sla]
  }
};
